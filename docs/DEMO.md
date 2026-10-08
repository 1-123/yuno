# Demo · Mercado Verde

启动方式见 [README](../README.md)。用户提供的录屏见下；另附建议的两分钟走查流程和待完成的截图清单。界面展示的交易和故障均为模拟数据。

## Video

[Open the user-supplied screen recording](demo/checkout-health-demo.mp4).

The recording was provided separately by the user and is preserved as the original, unmodified MP4. It lasts approximately 2 minutes 22 seconds and is 168.71 MiB. The file is stored with Git LFS; open the link above to download it from GitHub, or use `git lfs pull` after installing and initializing Git LFS in a local clone. The application runs without the recording.

The recording does not change the status of automated browser verification or the pending screenshot checklist below.

**Verification and screenshot status:** screenshots have not been captured. Automated browser access was blocked because its security check could not verify saved permissions. The screenshot checklist below describes pending captures, not completed visual checks. Build verification and all fifteen tests passed: eleven data tests and four server-rendered markup checks. Browser interaction and visual layout still need manual verification.

## Suggested two-minute walkthrough

| Time | Action | What to highlight |
| --- | --- | --- |
| 0:00–0:25 | Open the overview with all countries selected. | The incident banner and health colors make the affected segments visible immediately. Compare Colombia with Peru and Chile, then point to the latest approval rate and its change from the preceding 30 minutes. |
| 0:25–0:50 | Follow the six-hour chart; toggle a country series and switch to 1h. | The chart separates an earlier processor degradation from the recent outage. A shared percentage axis makes cross-country comparisons meaningful. |
| 0:50–1:15 | Select Colombia and inspect the method and processor breakdowns. | Narrow the view to PSE / PayAndean and show its low approval rate alongside volume. Clear the extra filters to return to the country comparison. |
| 1:15–1:40 | Leave live mode running for at least one five-second batch, then pause and resume. | Point to the new transaction rows, stream timestamp or count, and updated metrics. Pausing freezes the incoming stream for inspection; resuming continues it. |
| 1:40–2:00 | Open Incidents, then search Transactions, choose an outcome tab, and export CSV. | Show how the same dataset supports incident triage and record-level investigation. Transactions export includes all matches for dimensions, search, and outcome, beyond the visible page. |

## Manual screenshot checklist

Start the application, open [http://127.0.0.1:5173](http://127.0.0.1:5173) in a browser, and create a `docs/screenshots` folder. Use the browser or operating system's screen-capture feature, save the files as JPEG, and add the following captions when preparing the final submission. These filenames are planned destinations; the files do not currently exist.

| Planned filename | Capture procedure | Suggested annotation |
| --- | --- | --- |
| `docs/screenshots/overview.jpg` | Use a desktop-width viewport, select all countries/methods/processors, and keep the 6h chart visible. Capture the incident banner, market cards, chart, and breakdowns. | Highlight the active SurPay outage, the affected market, and the healthy comparison segments. Explain that the chart provides the six-hour incident context. |
| `docs/screenshots/colombia-filter.jpg` | Select Colombia, then capture its scoped chart and method/processor breakdowns. Open the PSE detail dialog if decline reasons are useful to show. | Highlight PSE / PayAndean's low approval rate and attempt count. Show the active country filter and explain how it narrows the detail view. |
| `docs/screenshots/live-update.jpg` | Clear extra filters and restore the overview. Record the initial count and last-sync time, wait at least one five-second batch, then capture the updated values. Pause afterward to inspect the snapshot. | Label the before/after timestamp and count. A single frame cannot establish ongoing movement; pair it with the initial capture or demonstrate live updates in a recording. |
| `docs/screenshots/mobile.jpg` | Resize the browser to a narrow viewport or use a mobile preview, then capture the overview. Check navigation, filter controls, chart labels, and horizontal table scrolling manually. | Highlight how the overview adapts to the narrow screen. Note any layout issue found during manual verification instead of presenting it as already validated. |

## Reviewer notes

Current KPIs use the latest 30 minutes, with comparison against the previous 30 minutes. The 6h / 3h / 1h control changes chart scope; the ledger and export retain rolling six-hour history. Country cards keep the three-country comparison visible, and incidents remain workspace-wide. On Transactions, CSV includes all records matching dimension filters, search, and the outcome tab, beyond the displayed page. On Overview or Incidents, CSV uses only dimension filters. All monetary amounts are illustrative USD equivalents. PIX is an illustrative cross-border option, and cash vouchers have terminal outcomes in this simplified dataset.

Reload the page to return to the initial seeded dataset. No credentials or external services are needed.
