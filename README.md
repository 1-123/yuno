# Mercado Verde · Checkout Health

一个用于 Mercado Verde 支付运营团队的实时结账健康监控原型。它把哥伦比亚、秘鲁、智利的授权率、支付方式和处理商表现放在同一视图中，并通过模拟交易持续展示变化。应用无需登录或外部 API，可在本地直接运行。

## 本地运行

需要 Node.js 22 或更高版本及 npm。克隆仓库并安装依赖：

```sh
git clone https://github.com/1-123/yuno.git
cd yuno
npm install
npm run dev
```

也可以从 GitHub 的 **Code → Download ZIP** 下载并解压，在包含 `package.json` 的目录运行上述 npm 命令。

浏览器访问 [http://127.0.0.1:5173](http://127.0.0.1:5173)。开发服务固定使用此端口；如果端口已被占用，启动会停止，请先释放该端口。

生成并预览生产版本：

```sh
npm run build
npm run preview
```

预览地址通常为 [http://127.0.0.1:4173](http://127.0.0.1:4173)。运行数据、指标与渲染测试：

```sh
npm test
```

`npm run build` 同时执行 TypeScript 检查与生产构建。`npm test` 使用 Node.js 原生测试运行器，无需额外测试服务。

演示录屏保留用户提供的原始 MP4，约 2 分 22 秒、168.71 MiB，使用 Git LFS 存储。应用运行不依赖视频文件。如需在本地获取录屏，安装 Git LFS 后在仓库目录运行以下命令；也可以打开下方的录屏链接，在 GitHub 文件页面下载：

```sh
git lfs install
git lfs pull
```

## 建议体验顺序

1. 打开总览，先观察顶部告警、三国健康卡片和授权率曲线，定位 Colombia 与 SurPay 的问题。
2. 点击 Colombia，或使用国家、支付方式、处理商筛选，进一步观察 PSE / PayAndean 的持续低授权率。
3. 在 6h、3h、1h 时间窗之间切换；通过曲线图例开关国家序列，比较不同市场的趋势。
4. 保持实时模式开启，等待约 5 秒：新交易会进入列表，计数、指标及曲线随之更新。使用暂停 / 恢复控制固定或继续观察数据。
5. 在 Incidents 查看需要优先调查的条件，在 Transactions 搜索记录、筛选交易结果，并导出全部匹配记录的 CSV。

完整的两分钟演示流程和待完成的截图拍摄清单见 [docs/DEMO.md](docs/DEMO.md)。

## Product and visual decisions

The first screen is designed for a stressed operations team: a prominent incident banner, country health cards, and a shared time-series chart make the affected market visible before someone opens a detail table. A pale sage and paper palette keeps long monitoring sessions comfortable; a dark green navigation rail gives the page a stable visual anchor. Red, amber, and green are paired with status words and directional indicators so color is not the only signal. Fonts are bundled locally with the application, so rendering does not depend on an external font service.

The approval-rate chart uses a common percentage scale across countries. Country series can be toggled to reduce clutter, while 6-hour, 3-hour, and 1-hour windows let operators move from the incident's history to its recent direction. Segmented payment-method and processor tables combine approval rate with attempt volume: a low percentage means more when its sample size is visible.

Selecting a country card is a shortcut into the same filtering model used by the controls. Country, method, and processor selections narrow the chart, KPI summaries, detail views, and transaction activity together. Country cards retain all three countries for comparison, and incidents remain workspace-wide so an outage stays visible while a healthy route is selected. Clicking a method, processor, or incident opens a detail dialog with attempt counts and decline reasons. Searching the activity list helps find a particular record. CSV export on Transactions includes all records matching the three dimension filters, search text, and outcome tab, regardless of visible pagination. On Overview or Incidents, export uses the three dimension filters across the rolling six-hour dataset. Pause / resume lets a reviewer inspect a moving dashboard without racing the next batch.

## Architecture and metric definitions

The application uses React 19, TypeScript, and Vite. It is a client-side application with three responsibilities: generate payment events, derive metrics from those events, and render interactive views. Transaction records are the source of truth; the interface does not use independently fabricated KPI values. Shared filtering and aggregation provide consistent calculations across cards, charts, tables, alerts, and exports, with each view's scope described above.

| Source | Responsibility |
| --- | --- |
| [src/lib/data.ts](src/lib/data.ts) | Seeded historical and live generation, filtering, aggregation, time buckets, and alert rules |
| [src/App.tsx](src/App.tsx) | Shared state, stream controls, filters, detail dialogs, incident triage, activity ledger, and CSV export |
| [src/components/TrendChart.tsx](src/components/TrendChart.tsx) | Interactive approval-rate chart and historical range selection |
| [tests/data.test.ts](tests/data.test.ts) | Generator patterns, metric reconciliation, filtering, empty states, window boundaries, and live batches |
| [tests/render.test.mjs](tests/render.test.mjs) | Server-rendered markup checks for the initial incident view, empty chart buckets, zero versus missing data, and unavailable selected series |
| [scripts/generate-data.mjs](scripts/generate-data.mjs) | Standalone command for generating a reproducible JSON transaction snapshot |
| [data/transactions.json](data/transactions.json) | Checked-in 1,440-record snapshot ending at `2026-10-08T12:00:00Z` for inspection and handoff |

Each transaction includes a timestamp, country, payment method, processor, amount, and approved or declined terminal outcome. Approval rate is:

```text
approved attempts / all attempts × 100
```

Current health metrics use the latest 30 minutes of the simulated stream and compare against the preceding 30 minutes. Changes in approval rate are expressed in percentage points, not relative percent. The selected 6h / 3h / 1h window controls the chart; the activity ledger and export retain the rolling six-hour scope. A time-series point aggregates the underlying attempts in a 15-minute bucket. Empty segments have a null rate and display an em dash rather than 0%.

Amounts are generated as illustrative USD equivalents for comparison; the prototype does not convert local-currency transactions with live exchange rates. Approved volume sums approved attempt values. Revenue at risk sums declined attempt values, so it is a triage estimate rather than measured lost revenue.

Alerts derive from observed records with at least five attempts and highlight rates below 70%, drops greater than 10 percentage points, and processors with 0% approval. Up to three conditions are prioritized. The underlying volume is shown to support interpretation. Incident acknowledgments last for the current session; they do not modify records or resolve the simulated outage.

The accelerated simulation appends 12–18 new transactions every five seconds and retains a rolling six-hour history. React re-renders the derived views from the updated records, and pausing stops new batches while holding the snapshot clock. Reloading the page starts a fresh simulated session; this prototype does not persist live state or connect to a payment service.

## Test data and domain assumptions

The initial seeded dataset contains exactly 1,440 terminal transactions spanning six hours: 720 Colombia, 432 Peru, and 288 Chile, with 864 Card attempts (60% of volume). It covers the five methods required for the exercise—Cards, PSE, Webpay, PIX, and Cash Vouchers—and four fictional processors: PayAndean, SurPay, Confia Payments, and TransLatam. The scenario mentions eight merchant methods, but this prototype implements the five specified in the test-data requirements.

The checked-in [data/transactions.json](data/transactions.json) snapshot provides a directly inspectable dataset with a fixed endpoint. Regenerate it with the current time, or supply an ISO endpoint for a reproducible snapshot:

```sh
npm run generate:data
npm run generate:data -- 2026-10-08T12:00:00Z
```

Both commands write `data/transactions.json`. The application generates its own dataset with fresh timestamps when it opens, using the same data functions; it does not consume this fixed JSON snapshot. The checked-in snapshot's full six-hour approval rate is 78.1%.

The first four hours have a 79.6% approval rate, while the latest half hour drops to 65.8%. The generator includes distinct incident patterns:

| Pattern | Intended investigation |
| --- | --- |
| Colombia / PSE / PayAndean at 13 / 24 approvals per half hour (54.2%) | A persistently weak country-method-processor combination |
| SurPay at 55% during hours 2–3 | A time-bounded processor incident visible in the chart |
| SurPay at 0% in the latest 30 minutes | A current outage that should receive immediate attention |
| PIX at 100% and Webpay at 91.7% in the seeded history | Healthy comparison segments |

Seeded generation makes the initial story repeatable for the same endpoint; a fresh load shifts the timestamps to the current time. Appended batches continue the incident patterns so the live view remains useful during a demo. Rates in a selected slice can differ from generator targets because they are calculated from its actual transactions; the seeded outage also lowers the latest overall rate relative to the healthy historical baseline.

PIX is a Brazilian rail. Its appearance here represents an illustrative cross-border BRL payment route in Peru, with amounts represented as USD equivalents; it is not a claim that PIX is a native rail in Colombia, Peru, or Chile. Cash vouchers are modeled only after reaching a final approved or declined outcome. Real cash payments would need a pending state and delayed confirmation. Processor names and all transaction data are fictional.

## Accessibility and responsive behavior

Controls use readable text labels, visible focus states, and native buttons or form inputs. Status labels supplement color, and transaction tables keep headings aligned with their values. The layout adapts from desktop monitoring to narrow screens, with dense tables able to scroll horizontally. Displayed times follow the viewer's local browser time zone; an operator working across countries would need an explicit reporting-zone control in a production version.

## What to improve next

- Connect a real event stream through SSE or WebSocket, with reconnection, duplicate-event handling, late arrivals, and clear stale-data states.
- Strengthen rolling-window sample-size protections and configurable alert rules, with incident grouping, persistent acknowledgments, and resolution history.
- Model pending payments, asynchronous cash confirmation, retries, and authorization versus settlement as separate lifecycle stages.
- Use audited exchange rates and selectable reporting time zones, and distinguish attempted value, approved GMV, and revenue at risk.
- Add persistent saved views, larger-dataset pagination or virtualization, and broader keyboard and assistive-technology checks.
- Introduce authentication, authorization, and server-side data access when adapting the prototype to merchant data.

## Submission contents

- Working React application and local transaction generator.
- Data and server-rendered markup tests, a standalone JSON generation script, and the checked-in fictional transaction snapshot.
- Setup, architecture, design decisions, and domain assumptions in this README.
- The [user-supplied original screen recording](docs/demo/checkout-health-demo.mp4), approximately 2 minutes 22 seconds, stored with Git LFS.
- A two-minute walkthrough and manual screenshot capture checklist in [docs/DEMO.md](docs/DEMO.md). Screenshot files have not been captured yet.

The optional local delivery archive at `deliverables/mercado-verde-checkout-health.zip` is excluded from Git, along with `node_modules/` and the generated `dist/` directory. It is not a repository download. Repository users install dependencies with `npm install` and create the production build with `npm run build`.

## Verification

`npm run build` passed, including TypeScript checking and the production build. All fifteen tests passed with `npm test`: eleven data tests cover deterministic generation, distributions, metric reconciliation, intersecting filters, empty segments, incident patterns, zero-approval markets and methods, missing comparison data, percentage-point deltas, time-window boundaries, and live batches. Four server-rendered markup tests cover the initial incident view without `NaN`, empty chart buckets, true 0% versus missing data, and unavailable selected series. These markup checks do not exercise browser interactions or verify visual layout.

Automated browser interaction, visual verification, and screenshot capture are unavailable in this session: the browser's security check could not verify its saved permissions. No screenshots or browser checks are claimed as completed. Open the local application manually and follow [docs/DEMO.md](docs/DEMO.md) to verify the interface and save the four planned `.jpg` captures.

This is a frontend monitoring prototype. It has no authentication, backend, real processor connection, or production alert delivery.
