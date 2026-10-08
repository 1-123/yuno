import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);

async function loadComponent(relativePath) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(relativePath, import.meta.url))],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    packages: "external",
    jsx: "automatic",
    loader: { ".css": "empty" },
  });
  const module = { exports: {} };
  const initialize = new Function(
    "require",
    "module",
    "exports",
    result.outputFiles[0].text,
  );
  initialize(require, module, module.exports);
  return module.exports.default;
}

const App = await loadComponent("../src/App.tsx");
const TrendChart = await loadComponent("../src/components/TrendChart.tsx");
const props = {
  visibleSeries: ["overall", "CO", "PE", "CL"],
  onToggleSeries() {},
  range: 6,
  onRangeChange() {},
  paused: true,
};
const endpoint = Date.UTC(2026, 9, 8, 12);

test("the initial dashboard renders the actual outage and three markets without invalid metric values", () => {
  const html = renderToStaticMarkup(React.createElement(App));
  assert.match(html, /SurPay is offline/);
  assert.match(html, /65\.8%/);
  assert.match(html, /0\.0%/);
  for (const country of ["Colombia", "Peru", "Chile"])
    assert.ok(html.includes(country));
  assert.match(html, /Payment methods/);
  assert.match(html, /Processor health/);
  assert.match(html, /Pause live updates/);
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
});

test("empty time buckets display a no-data message and remove keyboard inspection", () => {
  const points = Array.from({ length: 24 }, (_, index) => ({
    timestamp: endpoint - (23 - index) * 900000,
    overall: null,
    CO: null,
    PE: null,
    CL: null,
    attempts: 0,
  }));
  const html = renderToStaticMarkup(
    React.createElement(TrendChart, { ...props, points }),
  );
  assert.match(html, /No payment data in this window/);
  assert.match(html, /class="chart-plot" tabindex="-1"/);
  assert.doesNotMatch(html, /class="chart-tooltip/);
});

test("a real zero-percent observation is inspectable and is distinct from missing data", () => {
  const points = [
    { timestamp: endpoint, overall: 0, CO: 0, PE: null, CL: null, attempts: 5 },
  ];
  const html = renderToStaticMarkup(
    React.createElement(TrendChart, { ...props, points }),
  );
  assert.doesNotMatch(html, /No payment data in this window/);
  assert.match(html, /class="chart-plot" tabindex="0"/);
  assert.match(html, /0\.0%/);
  assert.match(html, /Peru, —/);
});

test("hiding every available series displays an empty chart instead of fabricated data", () => {
  const points = [
    {
      timestamp: endpoint,
      overall: 80,
      CO: 80,
      PE: null,
      CL: null,
      attempts: 10,
    },
  ];
  const html = renderToStaticMarkup(
    React.createElement(TrendChart, {
      ...props,
      points,
      visibleSeries: ["PE"],
    }),
  );
  assert.match(html, /No payment data in this window/);
  assert.match(html, /disabled="" title="Keep at least one series visible"/);
});
