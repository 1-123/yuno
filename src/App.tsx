import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Download,
  ExternalLink,
  Globe2,
  LayoutDashboard,
  Leaf,
  Menu,
  Pause,
  Play,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  TriangleAlert,
  Wallet,
  X,
  Zap,
  Banknote,
  Landmark,
  FileText,
  Radio,
  CircleDollarSign,
  RefreshCw,
} from "lucide-react";
import {
  COUNTRIES,
  METHODS,
  PROCESSORS,
  DEFAULT_FILTERS,
  generateDataset,
  generateLiveBatch,
  filterTransactions,
  summarize,
  getWindow,
  segmentMetrics,
  timeSeries,
  getAlerts,
} from "./lib/data";
import type {
  CountryId,
  MethodId,
  ProcessorId,
  Filters,
  Transaction,
} from "./lib/data";
import TrendChart from "./components/TrendChart";

type Page = "overview" | "transactions" | "incidents";
type Drawer = { title: string; filters: Filters };
const number = new Intl.NumberFormat("en-US");
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const clock = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const percent = (value: number | null) =>
  value === null ? "—" : `${value.toFixed(1)}%`;
const compactUsd = (value: number) =>
  value >= 1000 ? `$${(value / 1000).toFixed(1)}k` : usd.format(value);
const health = (rate: number | null) =>
  rate === null
    ? "empty"
    : rate < 70
      ? "critical"
      : rate < 80
        ? "warning"
        : "healthy";
const healthLabel = (rate: number | null) =>
  rate === null
    ? "No activity"
    : rate === 0
      ? "Offline"
      : rate < 70
        ? "Critical"
        : rate < 80
          ? "Degraded"
          : "Healthy";
const methodIcons: Record<MethodId, typeof CreditCard> = {
  cards: CreditCard,
  pse: Landmark,
  webpay: Wallet,
  pix: Zap,
  cash: Banknote,
};

function Delta({
  value,
  suffix = "vs. previous 30m",
}: {
  value: number | null;
  suffix?: string;
}) {
  if (value === null)
    return <span className="delta neutral">No previous data</span>;
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`delta ${value >= 0 ? "positive" : "negative"}`}>
      <Icon size={14} />
      <b>{Math.abs(value).toFixed(1)} pp</b>
      <span className="delta-suffix">{suffix}</span>
    </span>
  );
}

function Status({ rate }: { rate: number | null }) {
  return (
    <span className={`status ${health(rate)}`}>
      <i />
      {healthLabel(rate)}
    </span>
  );
}

function Flag({ country }: { country: string }) {
  return (
    <span
      role="img"
      aria-label={`${COUNTRIES.find((c) => c.id === country)?.name ?? country} flag`}
      className={`flag flag-${country}`}
    />
  );
}

function Sparkline({
  values,
  color,
}: {
  values: (number | null)[];
  color: string;
}) {
  const path = values
    .map((value, index) =>
      value === null
        ? ""
        : `${index === 0 || values[index - 1] === null ? "M" : "L"}${((index / Math.max(1, values.length - 1)) * 110).toFixed(1)},${(40 - (value / 100) * 36).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg className="sparkline" viewBox="0 0 114 44" aria-hidden="true">
      <path
        d={path}
        stroke={color}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Modal({
  children,
  title,
  onClose,
  className = "",
}: {
  children: ReactNode;
  title: string;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    root
      ?.querySelector<HTMLElement>('button, input, select, [tabindex="0"]')
      ?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab" || !root) return;
      const elements = [
        ...root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input, select, a[href], [tabindex="0"]',
        ),
      ];
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${className}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">MERCADO VERDE · OPERATIONS</span>
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TransactionTable({
  transactions,
  limit = 12,
}: {
  transactions: Transaction[];
  limit?: number;
}) {
  return (
    <div className="table-scroll">
      <table className="transaction-table">
        <thead>
          <tr>
            <th>Transaction</th>
            <th>Market</th>
            <th>Payment method</th>
            <th>Processor</th>
            <th>Amount</th>
            <th>Outcome</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {[...transactions]
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit)
            .map((tx) => (
              <tr key={tx.id}>
                <td>
                  <span className="transaction-id">{tx.id}</span>
                </td>
                <td>
                  <span className="country-cell">
                    <Flag country={tx.country} />
                    {tx.country}
                  </span>
                </td>
                <td>{METHODS.find((m) => m.id === tx.method)?.name}</td>
                <td>{PROCESSORS.find((p) => p.id === tx.processor)?.name}</td>
                <td className="numeric">{usd.format(tx.amount)}</td>
                <td>
                  <span
                    className={`outcome ${tx.status}`}
                    title={tx.failureReason ?? "Payment authorized"}
                  >
                    {tx.status === "approved" ? (
                      <Check size={12} />
                    ) : (
                      <X size={12} />
                    )}
                    {tx.status}
                  </span>
                </td>
                <td className="muted numeric">{clock.format(tx.timestamp)}</td>
              </tr>
            ))}
        </tbody>
      </table>
      {transactions.length === 0 && (
        <div className="empty-state">
          <Search size={28} />
          <h3>No matching transactions</h3>
          <p>Try another market, method, or processor.</p>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [initialTime] = useState(() => Date.now());
  const [transactions, setTransactions] = useState<Transaction[]>(() =>
    generateDataset(initialTime),
  );
  const [now, setNow] = useState(initialTime);
  const [paused, setPaused] = useState(false);
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS });
  const [page, setPage] = useState<Page>("overview");
  const [range, setRange] = useState(6);
  const [series, setSeries] = useState(["overall", "CO", "PE", "CL"]);
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [help, setHelp] = useState(false);
  const [settings, setSettings] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState("all");
  const [visibleCount, setVisibleCount] = useState(20);
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const sequence = useRef(0);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      const timestamp = Date.now();
      const batch = generateLiveBatch(timestamp, ++sequence.current);
      setTransactions((previous) => [
        ...previous.filter(
          (tx) => tx.timestamp > timestamp - 6 * 60 * 60 * 1000,
        ),
        ...batch,
      ]);
      setNow(timestamp);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [paused]);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    setVisibleCount(20);
  }, [filters, query, outcome]);

  const filtered = useMemo(
    () => filterTransactions(transactions, filters),
    [transactions, filters],
  );
  const current = useMemo(
    () => summarize(getWindow(filtered, now)),
    [filtered, now],
  );
  const previous = useMemo(
    () => summarize(getWindow(filtered, now - 30 * 60 * 1000)),
    [filtered, now],
  );
  const delta =
    current.rate !== null && previous.rate !== null
      ? current.rate - previous.rate
      : null;
  const countries = useMemo(
    () =>
      segmentMetrics(transactions, now, "country", {
        ...filters,
        country: "all",
      }),
    [transactions, now, filters],
  );
  const methods = useMemo(
    () => segmentMetrics(transactions, now, "method", filters),
    [transactions, now, filters],
  );
  const processors = useMemo(
    () => segmentMetrics(transactions, now, "processor", filters),
    [transactions, now, filters],
  );
  const points = useMemo(
    () => timeSeries(transactions, now, filters, range * 60),
    [transactions, now, filters, range],
  );
  const marketPoints = useMemo(
    () => timeSeries(transactions, now, { ...filters, country: "all" }, 360),
    [transactions, now, filters],
  );
  const alerts = useMemo(
    () => getAlerts(transactions, now),
    [transactions, now],
  );
  const outage = alerts.find(
    (alert) => alert.id.startsWith("outage-") && alert.processor,
  );
  const bannerMessage = outage
    ? `${PROCESSORS.find((processor) => processor.id === outage.processor)?.name ?? "A processor"} is offline`
    : "Checkout approvals are declining";
  const activeAlerts = alerts.filter(
    (alert) => !acknowledged.includes(alert.id),
  );
  const visibleTransactions = useMemo(
    () =>
      filtered.filter(
        (tx) =>
          (outcome === "all" || tx.status === outcome) &&
          (!query ||
            `${tx.id} ${tx.failureReason ?? ""} ${PROCESSORS.find((p) => p.id === tx.processor)?.name ?? ""}`
              .toLowerCase()
              .includes(query.toLowerCase())),
      ),
    [filtered, query, outcome],
  );
  const isFiltered =
    filters.country !== "all" ||
    filters.method !== "all" ||
    filters.processor !== "all";

  function navigate(next: Page) {
    setPage(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function updateFilter(key: keyof Filters, value: string) {
    setFilters((old) => ({ ...old, [key]: value }));
    if (key === "country")
      setSeries(
        value === "all" ? ["overall", "CO", "PE", "CL"] : ["overall", value],
      );
  }
  function resetFilters() {
    setFilters({ ...DEFAULT_FILTERS });
    setSeries(["overall", "CO", "PE", "CL"]);
  }
  function investigate(alert: (typeof alerts)[number]) {
    const next: Filters = {
      country: alert.country ?? "all",
      method: alert.method ?? "all",
      processor: alert.processor ?? "all",
    };
    setDrawer({ title: alert.title, filters: next });
  }
  function downloadCsv() {
    const exportTransactions =
      page === "transactions" ? visibleTransactions : filtered;
    const rows = [
      [
        "transaction_id",
        "timestamp_utc",
        "country",
        "payment_method",
        "processor",
        "amount_usd",
        "status",
        "failure_reason",
        "latency_ms",
      ],
      ...exportTransactions.map((tx) => [
        tx.id,
        new Date(tx.timestamp).toISOString(),
        tx.country,
        tx.method,
        tx.processor,
        tx.amount.toFixed(2),
        tx.status,
        tx.failureReason ?? "",
        tx.latencyMs,
      ]),
    ];
    const content = rows
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/csv;charset=utf-8;" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mercado-verde-transactions-${new Date(now).toISOString().slice(0, 10)}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast(
      `${number.format(exportTransactions.length)} transactions exported to CSV`,
    );
  }

  const drawerTransactions = drawer
    ? filterTransactions(transactions, drawer.filters)
    : [];
  const drawerCurrent = summarize(getWindow(drawerTransactions, now));
  const failures = getWindow(drawerTransactions, now)
    .filter((tx) => tx.status === "declined")
    .reduce<Record<string, number>>((acc, tx) => {
      const reason = tx.failureReason ?? "Unknown";
      acc[reason] = (acc[reason] ?? 0) + 1;
      return acc;
    }, {});

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to dashboard
      </a>
      {menuOpen && (
        <div className="sidebar-shade" onClick={() => setMenuOpen(false)} />
      )}
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            navigate("overview");
          }}
        >
          <span className="brand-symbol">
            <Leaf size={24} strokeWidth={1.7} />
          </span>
          <span>
            mercado
            <span className="brand-verde">
              verde<span className="brand-dot">.</span>
            </span>
          </span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-avatar">MV</span>
          <div>
            <strong>Mercado Verde</strong>
            <small>Production workspace</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <span className="nav-label">MONITOR</span>
        <nav aria-label="Main navigation">
          <button
            className={`nav-item ${page === "overview" ? "active" : ""}`}
            onClick={() => navigate("overview")}
            aria-current={page === "overview" ? "page" : undefined}
          >
            <LayoutDashboard size={18} />
            Overview
            <span className="nav-active-dot" />
          </button>
          <button
            className={`nav-item ${page === "transactions" ? "active" : ""}`}
            onClick={() => navigate("transactions")}
            aria-current={page === "transactions" ? "page" : undefined}
          >
            <ArrowUpRight size={19} />
            Transactions
          </button>
          <button
            className={`nav-item ${page === "incidents" ? "active" : ""}`}
            onClick={() => navigate("incidents")}
            aria-current={page === "incidents" ? "page" : undefined}
          >
            <TriangleAlert size={18} />
            Incidents
            {activeAlerts.length > 0 && (
              <span className="nav-count">{activeAlerts.length}</span>
            )}
          </button>
        </nav>
        <div className="nav-divider" />
        <span className="nav-label">WORKSPACE</span>
        <button className="nav-item" onClick={() => setSettings(true)}>
          <Settings2 size={18} />
          Monitor settings
        </button>
        <button className="nav-item" onClick={() => setHelp(true)}>
          <FileText size={18} />
          Dashboard guide
          <ExternalLink size={13} className="nav-external" />
        </button>
        <div className="sidebar-bottom">
          <div className="workspace-health">
            <span className={`live-dot ${paused ? "is-paused" : ""}`} />
            <div>
              <strong>
                {paused ? "Simulation paused" : "Your monitor is live"}
              </strong>
              <span>
                {paused
                  ? "Snapshot held for review"
                  : "Refreshing every 5 seconds"}
              </span>
            </div>
            <Radio size={16} />
          </div>
          <div className="profile">
            <span className="profile-avatar">MD</span>
            <div>
              <strong>Maria Delgado</strong>
              <small>Workspace admin</small>
            </div>
            <ShieldCheck size={17} />
          </div>
          <div className="powered">
            Orchestrated with{" "}
            <strong>
              yuno<span>✳</span>
            </strong>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle navigation"
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {page === "overview"
                ? "Checkout health"
                : page === "transactions"
                  ? "Transactions"
                  : "Incidents"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="environment">
              <span />
              Demo environment
            </span>
            <span className="topbar-divider" />
            <button
              className="icon-button"
              onClick={() => setHelp(true)}
              aria-label="Open dashboard guide"
            >
              <CircleHelp size={18} />
            </button>
            <button
              className="icon-button notification"
              onClick={() => navigate("incidents")}
              aria-label={`View ${activeAlerts.length} active incidents`}
            >
              <Bell size={18} />
              {activeAlerts.length > 0 && <i />}
            </button>
          </div>
        </header>
        <main id="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">PAYMENTS, WITH A PULSE</div>
              <h1>
                {page === "overview"
                  ? "Checkout health"
                  : page === "transactions"
                    ? "Transaction activity"
                    : "Incident center"}
                <span className="heading-period">.</span>
              </h1>
              <p>
                {page === "overview"
                  ? "A clear view of every payment. A faster path to action."
                  : page === "transactions"
                    ? "Follow the flow. Find the details behind every outcome."
                    : "The signals that matter, before they become bigger problems."}
              </p>
            </div>
            <div className="heading-actions">
              <button
                className={`live-control ${paused ? "paused" : ""}`}
                onClick={() => setPaused(!paused)}
                aria-label={
                  paused ? "Resume live updates" : "Pause live updates"
                }
              >
                <span className={`live-dot ${paused ? "is-paused" : ""}`} />
                <strong>{paused ? "Paused" : "Live"}</strong>
                <span className="live-control-divider" />
                {paused ? (
                  <Play size={13} fill="currentColor" />
                ) : (
                  <Pause size={13} fill="currentColor" />
                )}
              </button>
              <button
                className="button button-white export-button"
                onClick={downloadCsv}
              >
                <Download size={15} />
                Export<span className="export-csv"> CSV</span>
              </button>
            </div>
          </div>

          <div className="filter-bar">
            <div className="filters">
              <div className="filter-select">
                <Globe2 size={15} />
                <select
                  aria-label="Filter by country"
                  value={filters.country}
                  onChange={(event) =>
                    updateFilter("country", event.target.value)
                  }
                >
                  <option value="all">All countries</option>
                  {COUNTRIES.map((country) => (
                    <option key={country.id} value={country.id}>
                      {country.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={13} />
              </div>
              <div className="filter-select">
                <CreditCard size={15} />
                <select
                  aria-label="Filter by payment method"
                  value={filters.method}
                  onChange={(event) =>
                    updateFilter("method", event.target.value)
                  }
                >
                  <option value="all">All payment methods</option>
                  {METHODS.map((method) => (
                    <option key={method.id} value={method.id}>
                      {method.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={13} />
              </div>
              <div className="filter-select">
                <Server size={15} />
                <select
                  aria-label="Filter by processor"
                  value={filters.processor}
                  onChange={(event) =>
                    updateFilter("processor", event.target.value)
                  }
                >
                  <option value="all">All processors</option>
                  {PROCESSORS.map((processor) => (
                    <option key={processor.id} value={processor.id}>
                      {processor.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={13} />
              </div>
              {isFiltered && (
                <button className="reset-filters" onClick={resetFilters}>
                  <X size={13} />
                  Reset
                </button>
              )}
            </div>
            <span className="window-label">
              <Timer size={14} />
              Metrics: last 30 min
            </span>
          </div>

          {page === "overview" && (
            <>
              {alerts.length > 0 && (
                <div className="incident-banner">
                  <span className="banner-icon">
                    <TriangleAlert size={19} />
                  </span>
                  <div>
                    <strong>A little attention. A big difference.</strong>
                    <span>
                      {bannerMessage} · {alerts.length} payment conditions need
                      a closer look.
                    </span>
                  </div>
                  <button onClick={() => navigate("incidents")}>
                    Review incidents
                    <ArrowRight size={15} />
                  </button>
                </div>
              )}

              <section
                className="kpi-grid"
                aria-label="Current checkout metrics"
              >
                <article className="kpi-card">
                  <div className="kpi-label">
                    Authorization rate
                    <Activity size={16} />
                  </div>
                  <div className={`kpi-value ${health(current.rate)}`}>
                    {percent(current.rate)}
                    <span className="kpi-prompt">approval rate</span>
                  </div>
                  <Delta value={delta} />
                </article>
                <article className="kpi-card">
                  <div className="kpi-label">
                    Payment attempts
                    <CreditCard size={16} />
                  </div>
                  <div className="kpi-value">
                    {number.format(current.attempts)}
                    <span className="kpi-small-unit">payments</span>
                  </div>
                  <div className="kpi-footnote">
                    <span className="tiny-dot green" />
                    {number.format(current.approved)} approved
                    <span className="dot-separator">·</span>
                    {number.format(current.declined)} declined
                  </div>
                </article>
                <article className="kpi-card">
                  <div className="kpi-label">
                    Approved volume
                    <CircleDollarSign size={16} />
                  </div>
                  <div className="kpi-value">
                    {compactUsd(current.approvedGmv)}
                    <span className="kpi-small-unit">USD</span>
                  </div>
                  <div className="kpi-footnote">
                    Successfully authorized payment value
                  </div>
                </article>
                <article className="kpi-card risk-card">
                  <div className="kpi-label">
                    Revenue at risk
                    <TriangleAlert size={16} />
                  </div>
                  <div className="kpi-value">
                    {compactUsd(current.atRiskGmv)}
                    <span className="kpi-small-unit">USD</span>
                  </div>
                  <div className="kpi-footnote">
                    <span className="tiny-dot amber" />
                    Value of declined payment attempts
                  </div>
                </article>
              </section>

              <section className="market-section">
                <div className="section-heading">
                  <h2>
                    Markets at a glance<span className="subtle-count">03</span>
                  </h2>
                  <span className="section-note">
                    One region. Three perspectives.
                  </span>
                </div>
                <div className="market-grid">
                  {countries.map((country) => {
                    const color =
                      country.rate === null
                        ? "#99a29d"
                        : country.rate < 70
                          ? "#ce745f"
                          : country.rate < 80
                            ? "#cd9a43"
                            : "#5f967b";
                    return (
                      <button
                        key={country.id}
                        className={`market-card ${health(country.rate)} ${filters.country === country.id ? "selected" : ""}`}
                        onClick={() =>
                          updateFilter(
                            "country",
                            filters.country === country.id ? "all" : country.id,
                          )
                        }
                        aria-pressed={filters.country === country.id}
                        aria-label={`Filter to ${country.name}`}
                      >
                        <div className="market-top">
                          <span className="market-name">
                            <Flag country={country.id} />
                            <strong>{country.name}</strong>
                            <span>
                              {COUNTRIES.find((c) => c.id === country.id)?.code}
                            </span>
                          </span>
                          <Status rate={country.rate} />
                        </div>
                        <div className="market-middle">
                          <div className="market-value">
                            {percent(country.rate)}
                            <span>authorization rate</span>
                          </div>
                          <Sparkline
                            values={marketPoints.map(
                              (point) => point[country.id as CountryId],
                            )}
                            color={color}
                          />
                        </div>
                        <div className="market-bottom">
                          <Delta value={country.delta} suffix="" />
                          <span>
                            {country.attempts} attempts
                            <ChevronRight size={13} />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <div className="chart-layout">
                <TrendChart
                  points={points}
                  visibleSeries={series}
                  onToggleSeries={(key) =>
                    setSeries((old) =>
                      old.includes(key)
                        ? old.length === 1
                          ? old
                          : old.filter((item) => item !== key)
                        : [...old, key],
                    )
                  }
                  range={range}
                  onRangeChange={setRange}
                  paused={paused}
                  selectedCountry={filters.country}
                />
                <aside className="attention-card">
                  <div className="attention-header">
                    <span className="attention-title">
                      <span className="tiny-dot coral" />
                      Needs attention
                    </span>
                    <span className="attention-count">{alerts.length}</span>
                  </div>
                  <div className="attention-items">
                    {alerts.slice(0, 3).map((alert) => (
                      <button
                        className="attention-item"
                        key={alert.id}
                        onClick={() => investigate(alert)}
                      >
                        <div className="attention-item-top">
                          <span className={`severity ${alert.severity}`}>
                            {alert.severity === "critical"
                              ? "CRITICAL"
                              : "DEGRADED"}
                          </span>
                          <ArrowUpRight size={15} />
                        </div>
                        <strong>{alert.title}</strong>
                        <p>{alert.description}</p>
                        <span className="incident-mini-metric">
                          {percent(alert.rate)}
                          <small>
                            approval rate · {alert.attempts} attempts
                          </small>
                        </span>
                      </button>
                    ))}
                    {alerts.length === 0 && (
                      <div className="all-clear">
                        <ShieldCheck size={26} />
                        <strong>All clear</strong>
                        <p>No conditions exceed the alert thresholds.</p>
                      </div>
                    )}
                  </div>
                  <button
                    className="attention-footer"
                    onClick={() => navigate("incidents")}
                  >
                    Open incident center
                    <ArrowRight size={14} />
                  </button>
                </aside>
              </div>

              <section className="breakdown-grid">
                <div className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Payment methods</h2>
                      <p>Every way your customers pay.</p>
                    </div>
                    <span className="dimension-icon">
                      <CreditCard size={17} />
                    </span>
                  </div>
                  <div className="dimension-table">
                    <div className="dimension-table-head">
                      <span>METHOD</span>
                      <span>APPROVAL RATE</span>
                      <span>STATUS</span>
                    </div>
                    {methods.map((method) => {
                      const Icon = methodIcons[method.id as MethodId];
                      return (
                        <button
                          key={method.id}
                          className="dimension-row"
                          onClick={() =>
                            setDrawer({
                              title: `${method.name} performance`,
                              filters: {
                                ...filters,
                                method: method.id as MethodId,
                              },
                            })
                          }
                        >
                          <span className="dimension-name">
                            <span className={`method-icon method-${method.id}`}>
                              <Icon size={17} />
                            </span>
                            <span>
                              <strong>{method.name}</strong>
                              <small>{method.attempts} attempts</small>
                            </span>
                          </span>
                          <span className="rate-cell">
                            <b>{percent(method.rate)}</b>
                            <span className="rate-track">
                              <i
                                className={health(method.rate)}
                                style={{ width: `${method.rate ?? 0}%` }}
                              />
                            </span>
                          </span>
                          <Status rate={method.rate} />
                        </button>
                      );
                    })}
                  </div>
                  <div className="panel-foot">
                    <span>
                      <span className="tiny-dot green" />
                      Healthy ≥ 80%
                    </span>
                    <span>
                      <span className="tiny-dot amber" />
                      Degraded 70–80%
                    </span>
                    <span>
                      <span className="tiny-dot coral" />
                      Critical &lt; 70%
                    </span>
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Processor health</h2>
                      <p>The connections behind every checkout.</p>
                    </div>
                    <span className="dimension-icon">
                      <Server size={17} />
                    </span>
                  </div>
                  <div className="dimension-table">
                    <div className="dimension-table-head">
                      <span>PROCESSOR</span>
                      <span>APPROVAL RATE</span>
                      <span>STATUS</span>
                    </div>
                    {processors.map((processor, index) => (
                      <button
                        key={processor.id}
                        className="dimension-row"
                        onClick={() =>
                          setDrawer({
                            title: `${processor.name} performance`,
                            filters: {
                              ...filters,
                              processor: processor.id as ProcessorId,
                            },
                          })
                        }
                      >
                        <span className="dimension-name">
                          <span
                            className={`processor-symbol processor-${index}`}
                          >
                            {["P", "S", "c", "T"][index]}
                            <span />
                          </span>
                          <span>
                            <strong>{processor.name}</strong>
                            <small>
                              {processor.attempts} attempts ·{" "}
                              {processor.avgLatency > 0
                                ? `${(processor.avgLatency / 1000).toFixed(1)}s avg.`
                                : "—"}
                            </small>
                          </span>
                        </span>
                        <span className="rate-cell">
                          <b>{percent(processor.rate)}</b>
                          <span className="rate-track">
                            <i
                              className={health(processor.rate)}
                              style={{ width: `${processor.rate ?? 0}%` }}
                            />
                          </span>
                        </span>
                        <Status rate={processor.rate} />
                      </button>
                    ))}
                  </div>
                  <div className="processor-note">
                    <ShieldCheck size={15} />
                    <span>Routing signals from 4 connected processors</span>
                  </div>
                </div>
              </section>

              <section className="panel recent-panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      Latest payment activity
                      <span className="live-table-dot" />
                    </h2>
                    <p>
                      The most recent outcomes across your selected segments.
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => navigate("transactions")}
                  >
                    All transactions
                    <ArrowRight size={14} />
                  </button>
                </div>
                <TransactionTable transactions={filtered} limit={5} />
              </section>
            </>
          )}

          {page === "transactions" && (
            <section className="panel activity-panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    Payment ledger
                    <span className="subtle-count">
                      {number.format(visibleTransactions.length)}
                    </span>
                  </h2>
                  <p>
                    Six hours of simulated activity · all amounts normalized to
                    USD
                  </p>
                </div>
                <button className="text-button" onClick={downloadCsv}>
                  <Download size={14} />
                  Export selected data
                </button>
              </div>
              <div className="ledger-controls">
                <div className="search-box">
                  <Search size={17} />
                  <input
                    aria-label="Search transactions"
                    placeholder="Search ID, processor or failure reason..."
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  {query && (
                    <button
                      className="icon-button"
                      aria-label="Clear search"
                      onClick={() => setQuery("")}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div
                  className="outcome-tabs"
                  aria-label="Filter transaction outcome"
                >
                  {["all", "approved", "declined"].map((item) => (
                    <button
                      key={item}
                      aria-pressed={outcome === item}
                      className={outcome === item ? "active" : ""}
                      onClick={() => setOutcome(item)}
                    >
                      {item === "all"
                        ? "All outcomes"
                        : item.charAt(0).toUpperCase() + item.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <TransactionTable
                transactions={visibleTransactions}
                limit={visibleCount}
              />
              <div className="ledger-footer">
                <span>
                  Showing {Math.min(visibleCount, visibleTransactions.length)}{" "}
                  of {number.format(visibleTransactions.length)} transactions
                </span>
                {visibleCount < visibleTransactions.length && (
                  <button
                    className="button button-white"
                    onClick={() => setVisibleCount((old) => old + 20)}
                  >
                    Load 20 more
                    <ChevronDown size={14} />
                  </button>
                )}
              </div>
            </section>
          )}

          {page === "incidents" && (
            <>
              <div className="incident-summary">
                <div>
                  <span className="incident-big-icon">
                    <TriangleAlert size={25} />
                  </span>
                  <div>
                    <h2>{activeAlerts.length} conditions to investigate</h2>
                    <p>
                      Calculated from the last 30 minutes. Updated with each
                      batch.
                    </p>
                  </div>
                </div>
                <span className="status warning">
                  <i />
                  Action recommended
                </span>
              </div>
              <div className="incident-list">
                {alerts.map((alert) => (
                  <article
                    className={`incident-detail ${acknowledged.includes(alert.id) ? "acknowledged" : ""}`}
                    key={alert.id}
                  >
                    <div className={`incident-icon ${alert.severity}`}>
                      <TriangleAlert size={22} />
                    </div>
                    <div className="incident-body">
                      <div className="incident-detail-title">
                        <h2>{alert.title}</h2>
                        <span className={`severity ${alert.severity}`}>
                          {alert.severity}
                        </span>
                        {acknowledged.includes(alert.id) && (
                          <span className="acknowledge-label">
                            <Check size={12} />
                            Acknowledged
                          </span>
                        )}
                      </div>
                      <p>{alert.description}</p>
                      <div className="incident-stats">
                        <span>
                          <b>{percent(alert.rate)}</b>approval rate
                        </span>
                        <span>
                          <b>{alert.attempts}</b>payment attempts
                        </span>
                        <span>
                          <b>
                            {alert.delta === null
                              ? "—"
                              : `${Math.abs(alert.delta).toFixed(1)} pp`}
                          </b>
                          {alert.delta === null
                            ? "No previous data"
                            : `${alert.delta < 0 ? "drop" : "change"} vs. previous 30m`}
                        </span>
                      </div>
                    </div>
                    <div className="incident-actions">
                      <button
                        className="button button-green"
                        onClick={() => investigate(alert)}
                      >
                        Investigate
                        <ArrowRight size={14} />
                      </button>
                      <button
                        className="text-button"
                        onClick={() => {
                          setAcknowledged((old) =>
                            old.includes(alert.id)
                              ? old.filter((id) => id !== alert.id)
                              : [...old, alert.id],
                          );
                          setToast(
                            acknowledged.includes(alert.id)
                              ? "Incident returned to the active queue"
                              : "Incident acknowledged for this session",
                          );
                        }}
                      >
                        {acknowledged.includes(alert.id)
                          ? "Reopen"
                          : "Acknowledge"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              <div className="incident-explainer">
                <ShieldCheck size={18} />
                <div>
                  <strong>Clear thresholds. Useful signals.</strong>
                  <p>
                    Segments below 70%, drops greater than 10 percentage points,
                    or processors with zero approvals are flagged. Low-volume
                    samples are labelled so you can judge the evidence.
                  </p>
                </div>
              </div>
            </>
          )}

          <footer className="page-footer">
            <span>
              <Leaf size={13} />A healthier checkout. A greener tomorrow.
            </span>
            <span>
              {paused ? "Snapshot paused" : "Last synced"}{" "}
              <time>{clock.format(now)}</time>
              <span className="dot-separator">·</span>Simulated data
              <span className="dot-separator">·</span>USD
            </span>
          </footer>
        </main>
      </div>

      {drawer && (
        <Modal
          title={drawer.title}
          onClose={() => setDrawer(null)}
          className="detail-modal"
        >
          <div className="detail-tags">
            {drawer.filters.country !== "all" && (
              <span>
                <Flag country={drawer.filters.country} />
                {COUNTRIES.find((c) => c.id === drawer.filters.country)?.name}
              </span>
            )}
            {drawer.filters.method !== "all" && (
              <span>
                <CreditCard size={13} />
                {METHODS.find((m) => m.id === drawer.filters.method)?.name}
              </span>
            )}
            {drawer.filters.processor !== "all" && (
              <span>
                <Server size={13} />
                {
                  PROCESSORS.find((p) => p.id === drawer.filters.processor)
                    ?.name
                }
              </span>
            )}
            <span>
              <Timer size={13} />
              Last 30 minutes
            </span>
          </div>
          <div className="detail-metrics">
            <div>
              <span>Authorization rate</span>
              <strong className={health(drawerCurrent.rate)}>
                {percent(drawerCurrent.rate)}
              </strong>
            </div>
            <div>
              <span>Attempts / approved</span>
              <strong>
                {drawerCurrent.attempts}
                <small> / {drawerCurrent.approved}</small>
              </strong>
            </div>
            <div>
              <span>Revenue at risk</span>
              <strong>{usd.format(drawerCurrent.atRiskGmv)}</strong>
            </div>
          </div>
          <div className="failure-panel">
            <h3>Why payments are declining</h3>
            {Object.entries(failures).length > 0 ? (
              Object.entries(failures)
                .sort((a, b) => b[1] - a[1])
                .map(([reason, count]) => (
                  <div className="failure-row" key={reason}>
                    <span>{reason.replaceAll("_", " ")}</span>
                    <div>
                      <i
                        style={{
                          width: `${(count / Math.max(1, drawerCurrent.declined)) * 100}%`,
                        }}
                      />
                    </div>
                    <b>{count}</b>
                  </div>
                ))
            ) : (
              <p className="muted">
                No declined payments in the current window.
              </p>
            )}
          </div>
          <h3 className="detail-ledger-title">
            Recent transactions in this segment
          </h3>
          <TransactionTable transactions={drawerTransactions} limit={8} />
          <div className="detail-footer">
            <button
              className="button button-white"
              onClick={() => setDrawer(null)}
            >
              Close
            </button>
            <button
              className="button button-green"
              onClick={() => {
                setFilters(drawer.filters);
                setSeries(
                  drawer.filters.country === "all"
                    ? ["overall", "CO", "PE", "CL"]
                    : ["overall", drawer.filters.country],
                );
                setDrawer(null);
                navigate("overview");
              }}
            >
              Apply to dashboard
              <ArrowRight size={14} />
            </button>
          </div>
        </Modal>
      )}

      {help && (
        <Modal
          title="Your checkout health guide"
          onClose={() => setHelp(false)}
        >
          <div className="guide-content">
            <p className="guide-intro">
              A shared view of payment performance, built for the moments that
              matter.
            </p>
            <div className="guide-step">
              <span>01</span>
              <div>
                <h3>Start with the signals</h3>
                <p>
                  Green means at least 80% of attempts are approved. Amber marks
                  70–80%. Coral highlights rates below 70%. A 0% processor is
                  flagged as a potential outage.
                </p>
              </div>
            </div>
            <div className="guide-step">
              <span>02</span>
              <div>
                <h3>Follow the story</h3>
                <p>
                  The chart shows approval rates in time buckets, using approved
                  ÷ total attempts. Toggle markets to compare, hover for
                  details, or choose a shorter time range.
                </p>
              </div>
            </div>
            <div className="guide-step">
              <span>03</span>
              <div>
                <h3>Go from signal to detail</h3>
                <p>
                  Click a market to filter the dashboard. Click a method,
                  processor, or incident to see transaction counts and decline
                  reasons. Export the selected six-hour dataset as CSV.
                </p>
              </div>
            </div>
            <div className="guide-step">
              <span>04</span>
              <div>
                <h3>Live, at your pace</h3>
                <p>
                  New simulated payments arrive every five seconds. Pause the
                  stream to review a stable snapshot, then resume when you are
                  ready.
                </p>
              </div>
            </div>
            <div className="demo-note">
              <Leaf size={18} />
              <p>
                This is a prototype with seeded, fictional payment data. PIX
                represents an illustrative cross-border BRL payment; it is not a
                native rail in these three markets. Cash vouchers use simulated
                final outcomes.
              </p>
            </div>
          </div>
          <div className="detail-footer">
            <button
              className="button button-green"
              onClick={() => setHelp(false)}
            >
              Got it
              <Check size={14} />
            </button>
          </div>
        </Modal>
      )}

      {settings && (
        <Modal title="Monitor settings" onClose={() => setSettings(false)}>
          <div className="settings-content">
            <div className="setting-row">
              <span>
                <strong>Live updates</strong>
                <small>
                  Receive a fresh batch of simulated transactions every 5
                  seconds.
                </small>
              </span>
              <button
                role="switch"
                aria-checked={!paused}
                aria-label="Enable live updates"
                className={`switch ${!paused ? "enabled" : ""}`}
                onClick={() => setPaused(!paused)}
              >
                <span />
              </button>
            </div>
            <div className="setting-row">
              <span>
                <strong>Metric window</strong>
                <small>
                  Current approval rate, volume and revenue at risk.
                </small>
              </span>
              <span className="setting-value">30 minutes</span>
            </div>
            <div className="setting-row">
              <span>
                <strong>Critical approval threshold</strong>
                <small>Highlight underperforming payment segments.</small>
              </span>
              <span className="setting-value">&lt; 70%</span>
            </div>
            <div className="setting-row">
              <span>
                <strong>Sudden drop threshold</strong>
                <small>Compare with the preceding 30-minute window.</small>
              </span>
              <span className="setting-value">&gt; 10 pp</span>
            </div>
            <div className="setting-row">
              <span>
                <strong>Reporting currency</strong>
                <small>
                  All simulated amounts are normalized for comparison.
                </small>
              </span>
              <span className="setting-value">USD</span>
            </div>
            <div className="settings-note">
              <SlidersHorizontal size={17} />
              Thresholds are fixed to the prototype's scenario. Connect real
              event data to configure production monitoring.
            </div>
            <button
              className="text-button"
              onClick={() => {
                setAcknowledged([]);
                setToast("All incident acknowledgements cleared");
              }}
            >
              Reset incident acknowledgements
              <RefreshCw size={13} />
            </button>
          </div>
          <div className="detail-footer">
            <button
              className="button button-green"
              onClick={() => setSettings(false)}
            >
              Done
              <Check size={14} />
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
