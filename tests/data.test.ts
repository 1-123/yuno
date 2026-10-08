import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FILTERS,
  filterTransactions,
  generateDataset,
  generateLiveBatch,
  getAlerts,
  getWindow,
  segmentMetrics,
  summarize,
  timeSeries,
} from "../src/lib/data.ts";

const NOW = Date.UTC(2026, 9, 8, 6, 0, 0);
const records = generateDataset(NOW);

test("history is deterministic, spans six hours, and has unique transaction IDs", () => {
  assert.deepEqual(generateDataset(NOW), records);
  assert.equal(records.length, 1_440);
  assert.equal(
    new Set(records.map((record) => record.id)).size,
    records.length,
  );
  assert.ok(
    records.every(
      (record) =>
        record.timestamp > NOW - 6 * 60 * 60_000 && record.timestamp <= NOW,
    ),
  );
  assert.ok(
    records.every((record) => record.amount > 0 && record.latencyMs > 0),
  );
  assert.ok(
    records.every(
      (record) =>
        (record.status === "approved") === (record.failureReason === null),
    ),
  );
});

test("traffic has the intended uneven market distribution and card share", () => {
  assert.equal(records.filter((record) => record.country === "CO").length, 720);
  assert.equal(records.filter((record) => record.country === "PE").length, 432);
  assert.equal(records.filter((record) => record.country === "CL").length, 288);
  assert.equal(
    records.filter((record) => record.method === "cards").length,
    864,
  );
  assert.equal(new Set(records.map((record) => record.method)).size, 5);
  assert.equal(new Set(records.map((record) => record.processor)).size, 4);
});

test("summary reconciles counts, amounts, rate, and mean latency to transaction records", () => {
  const current = getWindow(records, NOW);
  const metric = summarize(current);
  assert.equal(metric.attempts, current.length);
  assert.equal(metric.approved + metric.declined, metric.attempts);
  assert.equal(
    metric.approved,
    current.filter((record) => record.status === "approved").length,
  );
  assert.equal(metric.rate, (metric.approved / metric.attempts) * 100);
  const approvedCents = current
    .filter((record) => record.status === "approved")
    .reduce((sum, record) => sum + Math.round(record.amount * 100), 0);
  const declinedCents = current
    .filter((record) => record.status === "declined")
    .reduce((sum, record) => sum + Math.round(record.amount * 100), 0);
  assert.equal(metric.approvedGmv, approvedCents / 100);
  assert.equal(metric.atRiskGmv, declinedCents / 100);
  assert.equal(metric.gmv, (approvedCents + declinedCents) / 100);
  assert.equal(
    metric.avgLatency,
    current.reduce((sum, record) => sum + record.latencyMs, 0) / current.length,
  );
});

test("filters intersect all selected dimensions and segment metrics respect that scope", () => {
  const filters = {
    country: "CO",
    method: "pse",
    processor: "payandean",
  } as const;
  const selected = filterTransactions(records, filters);
  assert.equal(selected.length, 288);
  assert.ok(
    selected.every(
      (record) =>
        record.country === "CO" &&
        record.method === "pse" &&
        record.processor === "payandean",
    ),
  );
  const segments = segmentMetrics(records, NOW, "country", filters);
  assert.equal(segments.find((segment) => segment.id === "CO")?.attempts, 24);
  assert.equal(segments.find((segment) => segment.id === "PE")?.attempts, 0);
  assert.equal(segments.find((segment) => segment.id === "PE")?.rate, null);
});

test("zero-volume segments use null approval rates and do not create alerts", () => {
  assert.deepEqual(summarize([]), {
    attempts: 0,
    approved: 0,
    declined: 0,
    rate: null,
    gmv: 0,
    approvedGmv: 0,
    atRiskGmv: 0,
    avgLatency: 0,
  });
  assert.ok(
    segmentMetrics([], NOW, "method", DEFAULT_FILTERS).every(
      (segment) => segment.rate === null && segment.delta === null,
    ),
  );
  assert.ok(
    timeSeries([], NOW, DEFAULT_FILTERS).every(
      (point) => point.overall === null && point.attempts === 0,
    ),
  );
  assert.deepEqual(getAlerts([], NOW), []);
});

test("baseline and latest history reproduce degradation, sustained PSE failures, and a full outage", () => {
  const firstFourHours = records.filter(
    (record) => record.timestamp <= NOW - 2 * 60 * 60_000,
  );
  const baseline = summarize(firstFourHours).rate!;
  assert.ok(baseline >= 78 && baseline <= 82);
  const current = summarize(getWindow(records, NOW));
  assert.ok(current.rate! >= 64 && current.rate! <= 70);
  const surpay = records.filter((record) => record.processor === "surpay");
  assert.equal(summarize(getWindow(surpay, NOW)).rate, 0);
  assert.ok(summarize(getWindow(surpay, NOW - 3 * 60 * 60_000, 60)).rate! < 60);
  const pse = filterTransactions(records, {
    country: "CO",
    method: "pse",
    processor: "payandean",
  });
  assert.ok(summarize(pse).rate! >= 50 && summarize(pse).rate! <= 60);
  for (const method of ["pix", "webpay"] as const) {
    assert.ok(
      summarize(records.filter((record) => record.method === method)).rate! >
        90,
    );
  }
  const alerts = getAlerts(records, NOW);
  assert.equal(alerts.length, 3);
  assert.ok(
    alerts.some(
      (alert) =>
        alert.processor === "surpay" &&
        alert.rate === 0 &&
        alert.severity === "critical",
    ),
  );
  assert.equal(
    alerts.filter((alert) => alert.processor === "surpay").length,
    1,
  );
  assert.ok(
    alerts.some(
      (alert) =>
        alert.country === "CO" && alert.method === "pse" && alert.rate < 70,
    ),
  );
  assert.ok(
    alerts.every(
      (alert) =>
        alert.attempts > 0 &&
        (alert.rate < 70 || (alert.delta !== null && alert.delta < -10)),
    ),
  );
});

test("a fully failing country or method is flagged even when its processor remains healthy", () => {
  const mixed = Array.from({ length: 50 }, (_, index) => ({
    ...records[0],
    id: `isolated-failure-${index}`,
    timestamp: NOW - index * 1_000,
    country: index < 45 ? ("CO" as const) : ("CL" as const),
    method: index < 45 ? ("cards" as const) : ("webpay" as const),
    processor: "confia" as const,
    status: index < 45 ? ("approved" as const) : ("declined" as const),
    failureReason: index < 45 ? null : "Issuer declined",
  }));
  assert.equal(summarize(mixed).rate, 90);
  const alerts = getAlerts(mixed, NOW);
  assert.ok(
    alerts.some(
      (alert) =>
        alert.country === "CL" && alert.rate === 0 && alert.attempts === 5,
    ),
  );
  assert.ok(
    alerts.some(
      (alert) =>
        alert.method === "webpay" && alert.rate === 0 && alert.attempts === 5,
    ),
  );
  assert.ok(!alerts.some((alert) => alert.id === "outage-confia"));
  assert.ok(alerts.every((alert) => alert.delta === null));
});

test("outage alerts preserve an unavailable previous-window rate as null", () => {
  const currentOnly = getWindow(records, NOW).filter(
    (record) => record.processor === "surpay",
  );
  const outage = getAlerts(currentOnly, NOW).find(
    (alert) => alert.id === "outage-surpay",
  );
  assert.equal(outage?.rate, 0);
  assert.equal(outage?.delta, null);
});

test("segment delta is the change in percentage points from the preceding thirty minutes", () => {
  const current = segmentMetrics(
    records,
    NOW,
    "processor",
    DEFAULT_FILTERS,
  ).find((segment) => segment.id === "surpay")!;
  assert.equal(current.rate, 0);
  assert.equal(current.delta, -60);
});

test("windows and trend buckets include only records within their exact boundaries", () => {
  const example = records[0];
  const boundaries = [
    { ...example, id: "start", timestamp: NOW - 30 * 60_000 },
    { ...example, id: "inside", timestamp: NOW - 1 },
    { ...example, id: "end", timestamp: NOW },
    { ...example, id: "future", timestamp: NOW + 1 },
  ];
  assert.deepEqual(
    getWindow(boundaries, NOW).map((record) => record.id),
    ["inside", "end"],
  );
  const series = timeSeries([...records, boundaries[3]], NOW, DEFAULT_FILTERS);
  assert.equal(series.length, 24);
  assert.equal(
    series.reduce((sum, point) => sum + point.attempts, 0),
    records.length,
  );
  assert.ok(series.every((point) => point.timestamp <= NOW));
  assert.equal(series.at(-1)?.timestamp, NOW);
});

test("live batches are deterministic, unique across ticks, and retain the processor outage", () => {
  const first = generateLiveBatch(NOW + 5_000, 1);
  const second = generateLiveBatch(NOW + 10_000, 2);
  const repeatedTimestamp = generateLiveBatch(NOW + 10_000, 3);
  assert.deepEqual(generateLiveBatch(NOW + 5_000, 1), first);
  assert.equal(second.at(-1)?.timestamp, repeatedTimestamp.at(-1)?.timestamp);
  for (const batch of [first, second, repeatedTimestamp]) {
    assert.ok(batch.length >= 10 && batch.length <= 18);
    assert.ok(
      batch.every(
        (record) =>
          record.timestamp <= (batch === first ? NOW + 5_000 : NOW + 10_000),
      ),
    );
    assert.ok(
      batch
        .filter((record) => record.processor === "surpay")
        .every(
          (record) =>
            record.status === "declined" &&
            record.failureReason === "Processor timeout",
        ),
    );
  }
  const all = [...records, ...first, ...second, ...repeatedTimestamp];
  assert.equal(new Set(all.map((record) => record.id)).size, all.length);
  const laterMetrics = summarize(getWindow(all, NOW + 10_000));
  assert.ok(
    laterMetrics.attempts > summarize(getWindow(records, NOW)).attempts,
  );
});
