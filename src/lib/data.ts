/**
 * Deterministic synthetic checkout traffic. All values shown in the dashboard
 * are computed from these records; monetary amounts are USD equivalents.
 * PIX represents a small cross-border BRL checkout route in this simulation.
 */
export type CountryId = "CO" | "PE" | "CL";
export type MethodId = "cards" | "pse" | "webpay" | "pix" | "cash";
export type ProcessorId = "payandean" | "surpay" | "confia" | "translatam";

export const COUNTRIES: {
  id: CountryId;
  name: string;
  code: string;
  color: string;
}[] = [
  { id: "CO", name: "Colombia", code: "CO", color: "#e4ad44" },
  { id: "PE", name: "Peru", code: "PE", color: "#7971ed" },
  { id: "CL", name: "Chile", code: "CL", color: "#4eab9a" },
];

export const METHODS: { id: MethodId; name: string }[] = [
  { id: "cards", name: "Cards" },
  { id: "pse", name: "PSE" },
  { id: "webpay", name: "Webpay" },
  { id: "pix", name: "PIX" },
  { id: "cash", name: "Cash vouchers" },
];

export const PROCESSORS: { id: ProcessorId; name: string }[] = [
  { id: "payandean", name: "PayAndean" },
  { id: "surpay", name: "SurPay" },
  { id: "confia", name: "Confia Payments" },
  { id: "translatam", name: "TransLatam" },
];

export interface Transaction {
  id: string;
  timestamp: number;
  country: CountryId;
  method: MethodId;
  processor: ProcessorId;
  amount: number;
  status: "approved" | "declined";
  failureReason: string | null;
  latencyMs: number;
}

export interface Filters {
  country: "all" | CountryId;
  method: "all" | MethodId;
  processor: "all" | ProcessorId;
}

export const DEFAULT_FILTERS: Filters = {
  country: "all",
  method: "all",
  processor: "all",
};

export interface Summary {
  attempts: number;
  approved: number;
  declined: number;
  rate: number | null;
  gmv: number;
  approvedGmv: number;
  atRiskGmv: number;
  avgLatency: number;
}

export interface SegmentMetric extends Summary {
  id: CountryId | MethodId | ProcessorId;
  name: string;
  delta: number | null;
}

export interface TrendPoint {
  timestamp: number;
  overall: number | null;
  CO: number | null;
  PE: number | null;
  CL: number | null;
  attempts: number;
}

export interface Alert {
  id: string;
  severity: "critical" | "warning";
  title: string;
  description: string;
  country?: CountryId;
  method?: MethodId;
  processor?: ProcessorId;
  rate: number;
  delta: number | null;
  attempts: number;
}

type Route = Pick<Transaction, "country" | "method" | "processor">;
const MINUTE = 60_000;
const HALF_HOUR = 30 * MINUTE;

/** Stable integer mixing keeps synthetic values reproducible across reloads. */
function hash(seed: number): number {
  let value = seed | 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

/** 120 routes per half-hour: 60 CO, 36 PE, 24 CL; 72 card attempts. */
function createRoutes(): Route[] {
  const routes: Route[] = [];
  const add = (
    count: number,
    country: CountryId,
    method: MethodId,
    processor: ProcessorId,
  ) => {
    for (let index = 0; index < count; index += 1)
      routes.push({ country, method, processor });
  };
  add(8, "CO", "cards", "surpay");
  add(10, "CO", "cards", "payandean");
  add(6, "CO", "cards", "confia");
  add(6, "CO", "cards", "translatam");
  add(24, "CO", "pse", "payandean");
  add(3, "CO", "cash", "confia");
  add(3, "CO", "cash", "translatam");
  add(8, "PE", "cards", "surpay");
  add(8, "PE", "cards", "payandean");
  add(8, "PE", "cards", "confia");
  add(6, "PE", "cards", "translatam");
  add(6, "PE", "pix", "translatam");
  add(4, "CL", "cards", "surpay");
  add(6, "CL", "cards", "confia");
  add(2, "CL", "cards", "translatam");
  add(12, "CL", "webpay", "confia");
  return routes;
}

const ROUTES = createRoutes();

function createTransaction(
  route: Route,
  timestamp: number,
  id: string,
  approved: boolean,
  seed: number,
  outage: boolean,
): Transaction {
  const random = hash(seed);
  let failureReason: string | null = null;
  let latencyMs = 420 + (random % 980);
  if (!approved) {
    if (route.processor === "surpay" && outage) {
      failureReason = "Processor timeout";
      latencyMs = 9_000 + (random % 3_000);
    } else if (route.method === "pse" && route.processor === "payandean") {
      failureReason = "Bank connection error";
      latencyMs = 2_200 + (random % 1_600);
    } else if (route.method === "cash") {
      failureReason = "Voucher expired";
    } else if (route.processor === "surpay") {
      failureReason = "Acquirer unavailable";
      latencyMs = 3_000 + (random % 2_000);
    } else {
      failureReason = ["Insufficient funds", "Issuer declined", "Risk rules"][
        random % 3
      ];
    }
  }
  return {
    id,
    timestamp,
    ...route,
    amount: (1_800 + (random % 12_700)) / 100,
    status: approved ? "approved" : "declined",
    failureReason,
    latencyMs,
  };
}

/**
 * Six hours / 12 half-hour blocks / 120 attempts per block.
 * Quotas make the problem patterns inspectable rather than dependent on luck:
 * - CO / PSE / PayAndean remains at 13 of 24 approvals (54.2%).
 * - SurPay degrades during hours 2–3, recovers, then fails completely at the end.
 * - PIX and Webpay are healthy; the first four hours average 79.6%.
 */
export function generateDataset(endTime: number): Transaction[] {
  const records: Transaction[] = [];
  const start = endTime - 6 * 60 * MINUTE;
  for (let block = 0; block < 12; block += 1) {
    const approvals: Record<string, number> = {
      surpay:
        block === 11
          ? 0
          : block === 4 || block === 5
            ? 11
            : block === 10
              ? 12
              : block === 9
                ? 15
                : 17,
      otherCards: block >= 9 ? 44 : 45,
      pse: 13,
      webpay: 11,
      pix: 6,
      cash: 5,
    };
    const groupedRoutes = new Map<
      string,
      { route: Route; originalIndex: number }[]
    >();
    ROUTES.forEach((route, originalIndex) => {
      const key =
        route.method === "cards"
          ? route.processor === "surpay"
            ? "surpay"
            : "otherCards"
          : route.method;
      const group = groupedRoutes.get(key) ?? [];
      group.push({ route, originalIndex });
      groupedRoutes.set(key, group);
    });
    const outcomes = new Map<number, boolean>();
    groupedRoutes.forEach((routes, key) => {
      routes.sort(
        (a, b) =>
          hash(a.originalIndex * 131 + block * 907) -
          hash(b.originalIndex * 131 + block * 907),
      );
      routes.forEach(({ originalIndex }, rank) =>
        outcomes.set(originalIndex, rank < approvals[key]),
      );
    });
    // Multiplication by 37 permutes all 120 slots while distributing markets.
    for (let slot = 0; slot < 120; slot += 1) {
      const routeIndex = (slot * 37 + block * 13) % ROUTES.length;
      records.push(
        createTransaction(
          ROUTES[routeIndex],
          start + block * HALF_HOUR + (slot + 0.5) * 15_000,
          `mv-${Math.trunc(endTime)}-${block.toString(36)}-${slot.toString(36)}`,
          outcomes.get(routeIndex) ?? false,
          block * 12_013 + routeIndex * 479 + 71,
          block === 11,
        ),
      );
    }
  }
  return records;
}

/** The accelerated demo emits a reproducible 12–18 new attempts every 5 seconds. */
export function generateLiveBatch(
  now: number,
  sequence: number,
): Transaction[] {
  const batch: Transaction[] = [];
  const count = 12 + Math.abs(sequence % 7);
  for (let index = 0; index < count; index += 1) {
    const seed = Math.abs(sequence) * 65_537 + index * 7_919 + 53;
    const route =
      ROUTES[(Math.abs(sequence) * 17 + index * 37) % ROUTES.length];
    const approvalThreshold =
      route.processor === "surpay"
        ? 0
        : route.method === "pse"
          ? 54
          : route.method === "pix"
            ? 97
            : route.method === "webpay"
              ? 93
              : route.method === "cash"
                ? 84
                : 86;
    batch.push(
      createTransaction(
        route,
        now - (count - index - 1) * 20,
        `live-${Math.trunc(now)}-${sequence}-${index}`,
        hash(seed + 23) % 100 < approvalThreshold,
        seed,
        true,
      ),
    );
  }
  return batch;
}

export function filterTransactions(
  transactions: Transaction[],
  filters: Filters,
): Transaction[] {
  return transactions.filter(
    (transaction) =>
      (filters.country === "all" || transaction.country === filters.country) &&
      (filters.method === "all" || transaction.method === filters.method) &&
      (filters.processor === "all" ||
        transaction.processor === filters.processor),
  );
}

export function summarize(transactions: Transaction[]): Summary {
  let approved = 0;
  let approvedCents = 0;
  let declinedCents = 0;
  let latencyTotal = 0;
  for (const transaction of transactions) {
    const cents = Math.round(transaction.amount * 100);
    latencyTotal += transaction.latencyMs;
    if (transaction.status === "approved") {
      approved += 1;
      approvedCents += cents;
    } else {
      declinedCents += cents;
    }
  }
  const attempts = transactions.length;
  return {
    attempts,
    approved,
    declined: attempts - approved,
    rate: attempts === 0 ? null : (approved / attempts) * 100,
    gmv: (approvedCents + declinedCents) / 100,
    approvedGmv: approvedCents / 100,
    atRiskGmv: declinedCents / 100,
    avgLatency: attempts === 0 ? 0 : latencyTotal / attempts,
  };
}

/** Windows are start-exclusive, end-inclusive, and never include future data. */
export function getWindow(
  transactions: Transaction[],
  now: number,
  minutes = 30,
): Transaction[] {
  const start = now - minutes * MINUTE;
  return transactions.filter(
    (transaction) =>
      transaction.timestamp > start && transaction.timestamp <= now,
  );
}

export function segmentMetrics(
  transactions: Transaction[],
  now: number,
  dimension: "country" | "method" | "processor",
  filters: Filters,
): SegmentMetric[] {
  const filtered = filterTransactions(transactions, filters);
  const current = getWindow(filtered, now);
  const previous = getWindow(filtered, now - HALF_HOUR);
  const segments =
    dimension === "country"
      ? COUNTRIES
      : dimension === "method"
        ? METHODS
        : PROCESSORS;
  return segments.map((segment) => {
    const metric = summarize(
      current.filter((transaction) => transaction[dimension] === segment.id),
    );
    const prior = summarize(
      previous.filter((transaction) => transaction[dimension] === segment.id),
    );
    return {
      id: segment.id,
      name: segment.name,
      ...metric,
      delta:
        metric.rate === null || prior.rate === null
          ? null
          : metric.rate - prior.rate,
    };
  });
}

/** Fifteen-minute buckets show the historical incident and newest arrivals. */
export function timeSeries(
  transactions: Transaction[],
  now: number,
  filters: Filters,
  minutes = 360,
): TrendPoint[] {
  if (minutes <= 0) return [];
  const filtered = filterTransactions(transactions, filters);
  const start = now - minutes * MINUTE;
  const points: TrendPoint[] = [];
  const bucketCount = Math.ceil(minutes / 15);
  for (let index = 0; index < bucketCount; index += 1) {
    const bucketStart = start + index * 15 * MINUTE;
    const bucketEnd = Math.min(now, bucketStart + 15 * MINUTE);
    const bucket = filtered.filter(
      (transaction) =>
        transaction.timestamp > bucketStart &&
        transaction.timestamp <= bucketEnd,
    );
    points.push({
      timestamp: bucketEnd,
      overall: summarize(bucket).rate,
      CO: summarize(
        bucket.filter((transaction) => transaction.country === "CO"),
      ).rate,
      PE: summarize(
        bucket.filter((transaction) => transaction.country === "PE"),
      ).rate,
      CL: summarize(
        bucket.filter((transaction) => transaction.country === "CL"),
      ).rate,
      attempts: bucket.length,
    });
  }
  return points;
}

/** Prioritize an outage, the sustained failing route, then the affected market. */
export function getAlerts(transactions: Transaction[], now: number): Alert[] {
  const alerts: Alert[] = [];
  const processorMetrics = segmentMetrics(
    transactions,
    now,
    "processor",
    DEFAULT_FILTERS,
  );
  for (const processor of processorMetrics) {
    if (processor.attempts >= 5 && processor.rate === 0) {
      alerts.push({
        id: `outage-${processor.id}`,
        severity: "critical",
        title: `${processor.name} is not approving payments`,
        description: `0 of ${processor.attempts} attempts approved in the last 30 minutes. Investigate the processor connection and consider rerouting traffic.`,
        processor: processor.id as ProcessorId,
        rate: 0,
        delta: processor.delta,
        attempts: processor.attempts,
      });
    }
  }
  const routeFilters: Filters = {
    country: "CO",
    method: "pse",
    processor: "payandean",
  };
  const route = filterTransactions(transactions, routeFilters);
  const currentRoute = summarize(getWindow(route, now));
  const priorRoute = summarize(getWindow(route, now - HALF_HOUR));
  if (
    currentRoute.attempts >= 5 &&
    currentRoute.rate !== null &&
    currentRoute.rate < 70
  ) {
    alerts.push({
      id: "route-CO-pse-payandean",
      severity: "warning",
      title: "Colombia PSE approvals are below target",
      description: `${currentRoute.rate.toFixed(1)}% approval across ${currentRoute.attempts} attempts on PayAndean. Inspect bank connection errors and the alternate PSE route.`,
      country: "CO",
      method: "pse",
      processor: "payandean",
      rate: currentRoute.rate,
      delta:
        priorRoute.rate === null ? null : currentRoute.rate - priorRoute.rate,
      attempts: currentRoute.attempts,
    });
  }
  const candidates = [
    ...segmentMetrics(transactions, now, "country", DEFAULT_FILTERS).map(
      (metric) => ({ metric, dimension: "country" as const }),
    ),
    ...segmentMetrics(transactions, now, "method", DEFAULT_FILTERS).map(
      (metric) => ({ metric, dimension: "method" as const }),
    ),
    ...processorMetrics.map((metric) => ({
      metric,
      dimension: "processor" as const,
    })),
  ]
    .filter(
      ({ metric }) =>
        metric.attempts >= 5 &&
        metric.rate !== null &&
        (metric.rate < 70 || (metric.delta !== null && metric.delta < -10)),
    )
    .sort((a, b) => (a.metric.rate ?? 100) - (b.metric.rate ?? 100));
  for (const { metric, dimension } of candidates) {
    if (alerts.length >= 3) break;
    if (
      alerts.some(
        (alert) =>
          (dimension === "method" && alert.method === metric.id) ||
          (dimension === "processor" && alert.processor === metric.id),
      )
    )
      continue;
    const delta = metric.delta;
    const isDrop = delta !== null && delta < -10;
    alerts.push({
      id: `${dimension}-${metric.id}`,
      severity:
        metric.rate !== null && metric.rate < 60 ? "critical" : "warning",
      title: isDrop
        ? `${metric.name} approval rate is falling`
        : `${metric.name} approvals are below target`,
      description: `${(metric.rate ?? 0).toFixed(1)}% approval in the last 30 minutes${isDrop ? `, down ${Math.abs(delta).toFixed(1)} percentage points` : ""}. Review declines and failing routes.`,
      [dimension]: metric.id,
      rate: metric.rate ?? 0,
      delta,
      attempts: metric.attempts,
    });
  }
  return alerts.slice(0, 3);
}
