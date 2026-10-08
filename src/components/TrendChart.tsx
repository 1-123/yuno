import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { Clock3, Info } from "lucide-react";
import "./trend-chart.css";

export type ChartPoint = {
  timestamp: number;
  overall: number | null;
  CO: number | null;
  PE: number | null;
  CL: number | null;
  attempts: number;
};

export type TrendChartProps = {
  points: ChartPoint[];
  visibleSeries: string[];
  onToggleSeries: (key: string) => void;
  range: number;
  onRangeChange: (hours: number) => void;
  paused: boolean;
  selectedCountry?: "all" | "CO" | "PE" | "CL";
};

type SeriesKey = "overall" | "CO" | "PE" | "CL";
type Coordinate = { x: number; y: number };

const SERIES: { key: SeriesKey; label: string; color: string }[] = [
  { key: "overall", label: "Overall", color: "#245e46" },
  { key: "CO", label: "Colombia", color: "#d49435" },
  { key: "PE", label: "Peru", color: "#78a58d" },
  { key: "CL", label: "Chile", color: "#8598c5" },
];
const HEIGHT = 276;
const LEFT = 45;
const TOP = 15;
const BOTTOM = 233;
const THRESHOLD = 70;
const timeFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const detailTimeFormat = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function rateLabel(value: number | null | undefined) {
  return value == null || !Number.isFinite(value)
    ? "—"
    : `${value.toFixed(1)}%`;
}

function chartY(value: number) {
  return BOTTOM - (Math.min(100, Math.max(0, value)) / 100) * (BOTTOM - TOP);
}

function segmentsFor(
  points: ChartPoint[],
  key: SeriesKey,
  chartX: (timestamp: number) => number,
) {
  const segments: Coordinate[][] = [];
  let segment: Coordinate[] = [];
  for (const point of points) {
    const value = point[key];
    if (value == null || !Number.isFinite(value)) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else {
      segment.push({ x: chartX(point.timestamp), y: chartY(value) });
    }
  }
  if (segment.length) segments.push(segment);
  return segments;
}

function linePath(segment: Coordinate[]) {
  return segment
    .map(
      ({ x, y }, index) =>
        `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`,
    )
    .join(" ");
}

export function TrendChart({
  points,
  visibleSeries,
  onToggleSeries,
  range,
  onRangeChange,
  paused,
  selectedCountry = "all",
}: TrendChartProps) {
  const id = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(1000);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [keyboardFocused, setKeyboardFocused] = useState(false);
  useEffect(() => {
    const element = svgRef.current?.parentElement;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setCanvasWidth(Math.max(280, Math.round(entry.contentRect.width))),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const right = canvasWidth - 20;
  const sortedPoints = useMemo(
    () =>
      points
        .filter((point) => Number.isFinite(point.timestamp))
        .slice()
        .sort((a, b) => a.timestamp - b.timestamp),
    [points],
  );
  const endTime = sortedPoints.at(-1)?.timestamp ?? Date.now();
  const startTime = endTime - range * 60 * 60 * 1000;
  const windowPoints = useMemo(
    () =>
      sortedPoints.filter(
        (point) => point.timestamp >= startTime && point.timestamp <= endTime,
      ),
    [sortedPoints, startTime, endTime],
  );
  const chartX = (timestamp: number) =>
    LEFT +
    ((timestamp - startTime) / Math.max(1, endTime - startTime)) *
      (right - LEFT);
  const activeSeries = SERIES.filter((series) =>
    visibleSeries.includes(series.key),
  );
  const hasData = windowPoints.some((point) =>
    activeSeries.some(
      (series) =>
        point[series.key] !== null && Number.isFinite(point[series.key]),
    ),
  );
  const latestPoint = windowPoints.at(-1);
  const activePoint =
    !hasData || activeIndex == null
      ? undefined
      : windowPoints[Math.min(activeIndex, windowPoints.length - 1)];
  const activeX = activePoint ? chartX(activePoint.timestamp) : 0;
  const incidentKey: SeriesKey =
    selectedCountry === "all" ? "overall" : selectedCountry;
  const incidents: { start: number; end: number }[] = [];
  let incidentStart: number | null = null;
  windowPoints.forEach((point, index) => {
    const value = point[incidentKey];
    const isBelow =
      value != null && Number.isFinite(value) && value < THRESHOLD;
    const previous = windowPoints[index - 1];
    if (isBelow && incidentStart == null)
      incidentStart = previous
        ? (previous.timestamp + point.timestamp) / 2
        : point.timestamp;
    if (!isBelow && incidentStart != null) {
      incidents.push({
        start: incidentStart,
        end: previous
          ? (previous.timestamp + point.timestamp) / 2
          : point.timestamp,
      });
      incidentStart = null;
    }
    if (index === windowPoints.length - 1 && incidentStart != null)
      incidents.push({ start: incidentStart, end: point.timestamp });
  });

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !hasData) return;
    const pointerX = ((event.clientX - rect.left) / rect.width) * canvasWidth;
    const timestamp =
      startTime + ((pointerX - LEFT) / (right - LEFT)) * (endTime - startTime);
    let closest = 0;
    let distance = Infinity;
    windowPoints.forEach((point, index) => {
      const candidate = Math.abs(point.timestamp - timestamp);
      if (candidate < distance) {
        closest = index;
        distance = candidate;
      }
    });
    setActiveIndex(closest);
  }

  function handleKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!hasData) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      setActiveIndex((previous) =>
        Math.min(
          windowPoints.length - 1,
          Math.max(0, (previous ?? windowPoints.length - 1) + direction),
        ),
      );
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : windowPoints.length - 1);
    } else if (event.key === "Escape") {
      setActiveIndex(null);
    }
  }

  return (
    <section className="chart-card" aria-labelledby={`${id}-heading`}>
      <div className="chart-heading-row">
        <div>
          <div className="chart-title-row">
            <h2 id={`${id}-heading`}>Authorization rate</h2>
            <span
              className="chart-info"
              title="Approved payment attempts as a percentage of all payment attempts. Missing rates are shown as gaps."
              aria-label="Approved attempts divided by total attempts. Missing rates appear as gaps."
            >
              <Info size={14} aria-hidden="true" />
            </span>
          </div>
          <p className="chart-subtitle">
            Approval trends · 15-minute intervals
          </p>
        </div>
        <div className="chart-range-controls">
          <Clock3 size={15} className="chart-range-icon" aria-hidden="true" />
          <div
            className="chart-range-group"
            role="group"
            aria-label="Chart time range"
          >
            {[6, 3, 1].map((hours) => (
              <button
                key={hours}
                type="button"
                className={
                  range === hours
                    ? "chart-range-button chart-range-button-active"
                    : "chart-range-button"
                }
                aria-pressed={range === hours}
                aria-label={`Last ${hours} ${hours === 1 ? "hour" : "hours"}`}
                onClick={() => onRangeChange(hours)}
              >
                {hours}h
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="chart-legend" aria-label="Chart series">
        {SERIES.map((series) => {
          const active = visibleSeries.includes(series.key);
          const lastVisible = active && activeSeries.length === 1;
          return (
            <button
              key={series.key}
              type="button"
              className={`chart-legend-button${active ? "" : " chart-legend-button-muted"}`}
              aria-pressed={active}
              aria-label={`${series.label}, ${rateLabel(latestPoint?.[series.key])}. ${active ? "Hide" : "Show"} series.`}
              disabled={lastVisible}
              title={
                lastVisible
                  ? "Keep at least one series visible"
                  : `${active ? "Hide" : "Show"} ${series.label}`
              }
              onClick={() => onToggleSeries(series.key)}
            >
              <span
                className="chart-legend-swatch"
                style={{ backgroundColor: series.color }}
              />
              <span>{series.label}</span>
              <strong>{rateLabel(latestPoint?.[series.key])}</strong>
            </button>
          );
        })}
        <span className="chart-window-label">
          {paused
            ? "Updates paused"
            : `Last ${range} ${range === 1 ? "hour" : "hours"}`}
        </span>
      </div>

      <div
        className="chart-plot"
        tabIndex={hasData ? 0 : -1}
        role="group"
        aria-label="Authorization rate over time. Use the left and right arrow keys to inspect data, Home or End to jump, and Escape to close the details."
        onKeyDown={handleKeyboard}
        onFocus={() => {
          setKeyboardFocused(true);
          setActiveIndex(hasData ? windowPoints.length - 1 : null);
        }}
        onBlur={() => {
          setKeyboardFocused(false);
          setActiveIndex(null);
        }}
      >
        <svg
          ref={svgRef}
          className="chart-svg"
          viewBox={`0 0 ${canvasWidth} ${HEIGHT}`}
          role="img"
          aria-labelledby={`${id}-svg-title ${id}-svg-description`}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => {
            if (!keyboardFocused) setActiveIndex(null);
          }}
        >
          <title
            id={`${id}-svg-title`}
          >{`Authorization rates for the last ${range} ${range === 1 ? "hour" : "hours"}`}</title>
          <desc id={`${id}-svg-description`}>
            Time series for{" "}
            {activeSeries.map((series) => series.label).join(", ")}. The
            vertical axis runs from zero to one hundred percent. The dashed line
            is the seventy percent health threshold. Gaps represent unavailable
            data.{" "}
            {incidents.length
              ? "Shaded intervals indicate rates below the health threshold."
              : ""}
          </desc>
          <defs>
            <linearGradient id={`${id}-area`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#3f8464" stopOpacity="0.13" />
              <stop offset="100%" stopColor="#3f8464" stopOpacity="0.015" />
            </linearGradient>
            <clipPath id={`${id}-clip`}>
              <rect
                x={LEFT}
                y={TOP}
                width={right - LEFT}
                height={BOTTOM - TOP}
              />
            </clipPath>
          </defs>
          {[100, 75, 50, 25, 0].map((rate) => (
            <g key={rate}>
              <line
                x1={LEFT}
                x2={right}
                y1={chartY(rate)}
                y2={chartY(rate)}
                className="chart-gridline"
              />
              <text
                x={LEFT - 13}
                y={chartY(rate) + 4}
                className="chart-axis-label"
                textAnchor="end"
              >
                {rate}%
              </text>
            </g>
          ))}
          <g clipPath={`url(#${id}-clip)`}>
            {incidents.map((incident, index) => (
              <rect
                key={index}
                x={chartX(incident.start)}
                y={TOP}
                width={Math.max(
                  1,
                  chartX(incident.end) - chartX(incident.start),
                )}
                height={BOTTOM - TOP}
                fill="#eeb486"
                opacity="0.12"
              />
            ))}
            {visibleSeries.includes("overall") &&
              segmentsFor(windowPoints, "overall", chartX)
                .filter((segment) => segment.length > 1)
                .map((segment, index) => (
                  <path
                    key={`area-${index}`}
                    d={`${linePath(segment)} L${segment.at(-1)!.x.toFixed(2)},${BOTTOM} L${segment[0].x.toFixed(2)},${BOTTOM} Z`}
                    fill={`url(#${id}-area)`}
                  />
                ))}
            <line
              x1={LEFT}
              x2={right}
              y1={chartY(THRESHOLD)}
              y2={chartY(THRESHOLD)}
              className="chart-threshold-line"
            />
            {activeSeries
              .slice()
              .reverse()
              .map((series) => (
                <g key={series.key}>
                  {segmentsFor(windowPoints, series.key, chartX).map(
                    (segment, index) =>
                      segment.length === 1 ? (
                        <circle
                          key={index}
                          cx={segment[0].x}
                          cy={segment[0].y}
                          r={2.5}
                          fill={series.color}
                        />
                      ) : (
                        <path
                          key={index}
                          d={linePath(segment)}
                          fill="none"
                          stroke={series.color}
                          strokeWidth={series.key === "overall" ? 2.7 : 1.8}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ),
                  )}
                </g>
              ))}
            {activePoint && (
              <g>
                <line
                  x1={activeX}
                  x2={activeX}
                  y1={TOP}
                  y2={BOTTOM}
                  className="chart-crosshair"
                />
                {activeSeries.map((series) =>
                  activePoint[series.key] != null &&
                  Number.isFinite(activePoint[series.key]) ? (
                    <circle
                      key={series.key}
                      cx={activeX}
                      cy={chartY(activePoint[series.key]!)}
                      r={4}
                      fill={series.color}
                      stroke="white"
                      strokeWidth={2}
                    />
                  ) : null,
                )}
              </g>
            )}
          </g>
          <rect
            x={right - 107}
            y={chartY(THRESHOLD) - 17}
            width={104}
            height={16}
            rx={3}
            fill="white"
            fillOpacity="0.88"
          />
          <text
            x={right - 6}
            y={chartY(THRESHOLD) - 6}
            textAnchor="end"
            className="chart-threshold-label"
          >
            70% health threshold
          </text>
          {Array.from({ length: 7 }, (_, index) => {
            const timestamp = startTime + (index / 6) * (endTime - startTime);
            return (
              <text
                key={index}
                x={chartX(timestamp)}
                y={BOTTOM + 29}
                className={`chart-axis-label chart-time-label${index % 2 ? " chart-time-label-intermediate" : ""}`}
                textAnchor={
                  index === 0 ? "start" : index === 6 ? "end" : "middle"
                }
              >
                {timeFormat.format(timestamp)}
              </text>
            );
          })}
        </svg>
        {!hasData && (
          <div className="chart-empty">
            <strong>No payment data in this window</strong>
            <span>Choose another segment or enable an available series.</span>
          </div>
        )}
        {activePoint && (
          <div
            className={`chart-tooltip${activeX > canvasWidth / 2 ? " chart-tooltip-left" : ""}`}
            style={{
              left: `${Math.max(5, Math.min(95, (activeX / canvasWidth) * 100))}%`,
            }}
            role="status"
            aria-live="polite"
          >
            <div className="chart-tooltip-time">
              {detailTimeFormat.format(activePoint.timestamp)}
            </div>
            {activeSeries.map((series) => (
              <div className="chart-tooltip-row" key={series.key}>
                <span>
                  <i style={{ backgroundColor: series.color }} />
                  {series.label}
                </span>
                <strong>{rateLabel(activePoint[series.key])}</strong>
              </div>
            ))}
            <div className="chart-tooltip-attempts">
              <span>Payment attempts</span>
              <strong>{activePoint.attempts.toLocaleString()}</strong>
            </div>
          </div>
        )}
      </div>

      <div className="chart-footer">
        <span>
          <i className="chart-threshold-key" />
          70% health threshold
        </span>
        {incidents.length > 0 && (
          <span>
            <i className="chart-incident-key" />
            Below-threshold interval
          </span>
        )}
        <span className="chart-gap-note">Gaps indicate unavailable rates</span>
      </div>
    </section>
  );
}

export default TrendChart;
