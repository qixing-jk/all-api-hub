/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns */
import fs from "node:fs/promises"
import path from "node:path"

const comparisonSectionConfigs = [
  {
    id: "popup-initial",
    title: "Popup initial",
    kind: "initial",
    getSection(summary) {
      return summary.comparison.popup.initial
    },
  },
  {
    id: "popup-bookmarks-deferred",
    title: "Popup bookmarks deferred",
    kind: "deferred",
    getSection(summary) {
      return summary.comparison.popup.bookmarksDeferred
    },
  },
  {
    id: "popup-api-credential-profiles-deferred",
    title: "Popup API credentials deferred",
    kind: "deferred",
    getSection(summary) {
      return summary.comparison.popup.apiCredentialProfilesDeferred
    },
  },
  {
    id: "options-initial",
    title: "Options initial",
    kind: "initial",
    getSection(summary) {
      return summary.comparison.options.initial
    },
  },
  {
    id: "options-usage-analytics-deferred",
    title: "Options usage analytics deferred",
    kind: "deferred",
    getSection(summary) {
      return summary.comparison.options.usageAnalyticsDeferred
    },
  },
]

/**
 * Render a byte count into a human-readable string.
 */
export function formatBytes(value) {
  if (!Number.isFinite(value)) {
    return "n/a"
  }

  const sign = value < 0 ? "-" : ""
  const units = ["B", "KB", "MB", "GB"]
  let size = Math.abs(value)
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${sign}${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`
}

/**
 * Return the comparison sections in display order.
 */
export function getComparisonSections(summary) {
  return comparisonSectionConfigs.map((config) => ({
    ...config,
    section: config.getSection(summary),
  }))
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function toHref(targetPath) {
  return encodeURI(targetPath.split(path.sep).join("/"))
}

function formatSignedNumber(value) {
  if (!Number.isFinite(value)) {
    return "n/a"
  }

  return `${value > 0 ? "+" : ""}${value}`
}

function formatSignedBytes(value) {
  if (!Number.isFinite(value)) {
    return "n/a"
  }

  return `${value > 0 ? "+" : ""}${formatBytes(value)}`
}

function getDeltaClass(value) {
  if (!Number.isFinite(value) || value === 0) {
    return "delta-neutral"
  }

  return value > 0 ? "delta-positive" : "delta-negative"
}

function renderMetric(label, value) {
  return `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `
}

function renderChipList(items, tone, emptyLabel) {
  if (items.length === 0) {
    return `<p class="empty-state">${escapeHtml(emptyLabel)}</p>`
  }

  return `
    <div class="chip-list">
      ${items
        .map(
          (item) =>
            `<span class="chip chip-${tone}"><code>${escapeHtml(item)}</code></span>`,
        )
        .join("")}
    </div>
  `
}

function renderInitialSectionCard(title, section) {
  return `
    <article class="detail-card">
      <div class="detail-head">
        <div>
          <p class="eyebrow">Startup snapshot</p>
          <h3>${escapeHtml(title)}</h3>
        </div>
        <span class="delta-pill ${getDeltaClass(section.countDelta)}">
          ${escapeHtml(formatSignedNumber(section.countDelta))} resources
        </span>
      </div>

      <div class="metric-grid">
        ${renderMetric("Baseline resources", String(section.baselineCount))}
        ${renderMetric("Current resources", String(section.currentCount))}
        ${renderMetric("Resource delta", formatSignedNumber(section.countDelta))}
        ${renderMetric("Baseline JS heap", formatBytes(section.baselineHeapBytes))}
        ${renderMetric("Current JS heap", formatBytes(section.currentHeapBytes))}
        ${renderMetric("Heap delta", formatSignedBytes(section.heapDeltaBytes))}
      </div>

      <div class="list-grid">
        <section class="list-panel">
          <div class="list-head">
            <h4>Added in current</h4>
            <span>${section.addedResources.length}</span>
          </div>
          ${renderChipList(
            section.addedResources,
            "added",
            "No additional startup resources.",
          )}
        </section>

        <section class="list-panel">
          <div class="list-head">
            <h4>Removed from current</h4>
            <span>${section.removedResources.length}</span>
          </div>
          ${renderChipList(
            section.removedResources,
            "removed",
            "No startup resources were removed.",
          )}
        </section>
      </div>
    </article>
  `
}

function getDeferredCountDelta(section) {
  return section.currentResources.length - section.baselineResources.length
}

function renderDeferredSectionCard(title, section) {
  const countDelta = getDeferredCountDelta(section)

  return `
    <article class="detail-card">
      <div class="detail-head">
        <div>
          <p class="eyebrow">Deferred load</p>
          <h3>${escapeHtml(title)}</h3>
        </div>
        <span class="delta-pill ${getDeltaClass(countDelta)}">
          ${escapeHtml(formatSignedNumber(countDelta))} deferred resources
        </span>
      </div>

      <div class="metric-grid">
        ${renderMetric(
          "Baseline deferred count",
          String(section.baselineResources.length),
        )}
        ${renderMetric(
          "Current deferred count",
          String(section.currentResources.length),
        )}
        ${renderMetric("Deferred delta", formatSignedNumber(countDelta))}
      </div>

      <div class="list-grid">
        <section class="list-panel">
          <div class="list-head">
            <h4>Current deferred resources</h4>
            <span>${section.currentResources.length}</span>
          </div>
          ${renderChipList(
            section.currentResources,
            "current",
            "No deferred resources were captured.",
          )}
        </section>

        <section class="list-panel">
          <div class="list-head">
            <h4>Baseline deferred resources</h4>
            <span>${section.baselineResources.length}</span>
          </div>
          ${renderChipList(
            section.baselineResources,
            "baseline",
            "Baseline did not defer any resources here.",
          )}
        </section>
      </div>

      <div class="list-grid">
        <section class="list-panel">
          <div class="list-head">
            <h4>Added in current</h4>
            <span>${section.addedResources.length}</span>
          </div>
          ${renderChipList(
            section.addedResources,
            "added",
            "No newly deferred resources in current.",
          )}
        </section>

        <section class="list-panel">
          <div class="list-head">
            <h4>Removed from current</h4>
            <span>${section.removedResources.length}</span>
          </div>
          ${renderChipList(
            section.removedResources,
            "removed",
            "No previously deferred resources disappeared.",
          )}
        </section>
      </div>
    </article>
  `
}

function renderSectionMatrixRow({ title, kind, section }) {
  if (kind === "initial") {
    return `
      <tr>
        <td>${escapeHtml(title)}</td>
        <td>${section.baselineCount}</td>
        <td>${section.currentCount}</td>
        <td class="${getDeltaClass(section.countDelta)}">${escapeHtml(
          formatSignedNumber(section.countDelta),
        )}</td>
        <td>${escapeHtml(formatSignedBytes(section.heapDeltaBytes))}</td>
        <td>${section.addedResources.length}</td>
        <td>${section.removedResources.length}</td>
      </tr>
    `
  }

  const countDelta = getDeferredCountDelta(section)

  return `
    <tr>
      <td>${escapeHtml(title)}</td>
      <td>${section.baselineResources.length}</td>
      <td>${section.currentResources.length}</td>
      <td class="${getDeltaClass(countDelta)}">${escapeHtml(
        formatSignedNumber(countDelta),
      )}</td>
      <td>n/a</td>
      <td>${section.addedResources.length}</td>
      <td>${section.removedResources.length}</td>
    </tr>
  `
}

function buildOverviewCards(summary) {
  const popupInitial = summary.comparison.popup.initial
  const optionsInitial = summary.comparison.options.initial
  const popupDeferredCurrent =
    summary.comparison.popup.bookmarksDeferred.currentResources.length +
    summary.comparison.popup.apiCredentialProfilesDeferred.currentResources
      .length
  const popupDeferredBaseline =
    summary.comparison.popup.bookmarksDeferred.baselineResources.length +
    summary.comparison.popup.apiCredentialProfilesDeferred.baselineResources
      .length
  const optionsDeferredCurrent =
    summary.comparison.options.usageAnalyticsDeferred.currentResources.length
  const optionsDeferredBaseline =
    summary.comparison.options.usageAnalyticsDeferred.baselineResources.length
  const deferredDelta =
    popupDeferredCurrent +
    optionsDeferredCurrent -
    (popupDeferredBaseline + optionsDeferredBaseline)

  return [
    {
      title: "Popup startup resources",
      value: formatSignedNumber(popupInitial.countDelta),
      subtitle: `${popupInitial.baselineCount} -> ${popupInitial.currentCount}`,
      tone: getDeltaClass(popupInitial.countDelta),
    },
    {
      title: "Popup startup heap",
      value: formatSignedBytes(popupInitial.heapDeltaBytes),
      subtitle: `${formatBytes(popupInitial.baselineHeapBytes)} -> ${formatBytes(popupInitial.currentHeapBytes)}`,
      tone: getDeltaClass(popupInitial.heapDeltaBytes),
    },
    {
      title: "Options startup resources",
      value: formatSignedNumber(optionsInitial.countDelta),
      subtitle: `${optionsInitial.baselineCount} -> ${optionsInitial.currentCount}`,
      tone: getDeltaClass(optionsInitial.countDelta),
    },
    {
      title: "Deferred resources captured",
      value: String(popupDeferredCurrent + optionsDeferredCurrent),
      subtitle: `baseline ${popupDeferredBaseline + optionsDeferredBaseline}, delta ${formatSignedNumber(deferredDelta)}`,
      tone: getDeltaClass(deferredDelta),
    },
  ]
}

function renderOverviewCard(card) {
  return `
    <article class="overview-card">
      <p>${escapeHtml(card.title)}</p>
      <strong class="${card.tone}">${escapeHtml(card.value)}</strong>
      <span>${escapeHtml(card.subtitle)}</span>
    </article>
  `
}

function renderSummaryHtml(summary, summaryPath) {
  const comparisonSections = getComparisonSections(summary)
  const overviewCards = buildOverviewCards(summary)
  const detailCards = comparisonSections
    .map(({ title, kind, section }) =>
      kind === "initial"
        ? renderInitialSectionCard(title, section)
        : renderDeferredSectionCard(title, section),
    )
    .join("")

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lazy-loading comparison report</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4efe7;
        --bg-accent: #efe5d7;
        --panel: rgba(255, 255, 255, 0.82);
        --panel-strong: rgba(255, 255, 255, 0.94);
        --line: rgba(42, 52, 63, 0.12);
        --text: #182026;
        --muted: #5c6773;
        --shadow: 0 22px 48px rgba(62, 47, 29, 0.12);
        --positive-bg: #ffe5de;
        --positive-text: #9b3a28;
        --negative-bg: #e1f4ea;
        --negative-text: #196545;
        --neutral-bg: #ece7dd;
        --neutral-text: #5f5443;
        --added-bg: #e2eff8;
        --added-text: #285879;
        --removed-bg: #fde4dc;
        --removed-text: #934033;
        --current-bg: #e3f6ef;
        --current-text: #21634b;
        --baseline-bg: #eee6f7;
        --baseline-text: #664b8c;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(222, 194, 147, 0.36), transparent 28%),
          linear-gradient(180deg, var(--bg-accent), var(--bg));
        color: var(--text);
        font-family: "Aptos", "Segoe UI", sans-serif;
      }

      .container {
        max-width: 1400px;
        margin: 0 auto;
        padding: 32px 20px 56px;
      }

      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 20px;
        padding: 28px;
        border: 1px solid var(--line);
        border-radius: 28px;
        background: linear-gradient(145deg, rgba(255, 251, 244, 0.96), rgba(255, 255, 255, 0.86));
        box-shadow: var(--shadow);
      }

      .hero h1,
      .section-block h2,
      .detail-card h3 {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", serif;
        font-weight: 700;
        letter-spacing: 0.01em;
      }

      .hero h1 {
        font-size: clamp(2rem, 4vw, 3rem);
      }

      .hero-subtitle {
        margin: 12px 0 0;
        max-width: 64ch;
        color: var(--muted);
        line-height: 1.6;
      }

      .meta-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 14px;
        margin-top: 22px;
      }

      .meta-grid div {
        padding: 14px 16px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.68);
        border: 1px solid rgba(42, 52, 63, 0.08);
      }

      .meta-grid dt {
        margin: 0 0 6px;
        font-size: 0.82rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .meta-grid dd {
        margin: 0;
        font-weight: 600;
        word-break: break-word;
      }

      .hero-actions {
        display: flex;
        align-items: flex-start;
      }

      .hero-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 48px;
        padding: 0 18px;
        border-radius: 999px;
        background: #1f3e52;
        color: #f8f3ea;
        font-weight: 600;
        text-decoration: none;
      }

      .section-block {
        margin-top: 28px;
        padding: 24px;
        border: 1px solid var(--line);
        border-radius: 24px;
        background: var(--panel);
        backdrop-filter: blur(8px);
      }

      .section-note {
        margin: 10px 0 0;
        color: var(--muted);
        line-height: 1.6;
      }

      .overview-grid,
      .detail-grid {
        display: grid;
        gap: 16px;
      }

      .overview-grid {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        margin-top: 18px;
      }

      .overview-card,
      .detail-card {
        border: 1px solid rgba(42, 52, 63, 0.08);
        border-radius: 20px;
        background: var(--panel-strong);
      }

      .overview-card {
        padding: 18px 20px;
      }

      .overview-card p,
      .overview-card span,
      .eyebrow,
      .empty-state {
        color: var(--muted);
      }

      .overview-card p {
        margin: 0;
        font-size: 0.9rem;
        letter-spacing: 0.02em;
      }

      .overview-card strong {
        display: block;
        margin-top: 10px;
        font-size: clamp(1.8rem, 3vw, 2.4rem);
        line-height: 1.05;
      }

      .overview-card span {
        display: block;
        margin-top: 8px;
        font-size: 0.92rem;
      }

      .delta-positive {
        color: var(--positive-text);
      }

      .delta-negative {
        color: var(--negative-text);
      }

      .delta-neutral {
        color: var(--neutral-text);
      }

      table {
        width: 100%;
        margin-top: 18px;
        border-collapse: collapse;
        overflow: hidden;
        border-radius: 18px;
      }

      thead th {
        padding: 14px 16px;
        background: rgba(31, 62, 82, 0.08);
        font-size: 0.84rem;
        text-align: left;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--muted);
      }

      tbody td {
        padding: 14px 16px;
        border-top: 1px solid rgba(42, 52, 63, 0.08);
        vertical-align: top;
      }

      .detail-grid {
        margin-top: 18px;
      }

      .detail-card {
        padding: 20px;
      }

      .detail-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }

      .eyebrow {
        margin: 0 0 6px;
        font-size: 0.82rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .detail-card h3 {
        font-size: 1.4rem;
      }

      .delta-pill {
        display: inline-flex;
        align-items: center;
        min-height: 36px;
        padding: 0 14px;
        border-radius: 999px;
        font-weight: 700;
        white-space: nowrap;
      }

      .delta-pill.delta-positive {
        background: var(--positive-bg);
      }

      .delta-pill.delta-negative {
        background: var(--negative-bg);
      }

      .delta-pill.delta-neutral {
        background: var(--neutral-bg);
      }

      .metric-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 12px;
        margin-top: 18px;
      }

      .metric {
        padding: 14px 16px;
        border-radius: 18px;
        background: rgba(31, 62, 82, 0.04);
        border: 1px solid rgba(42, 52, 63, 0.06);
      }

      .metric span {
        display: block;
        font-size: 0.88rem;
      }

      .metric strong {
        display: block;
        margin-top: 8px;
        font-size: 1.2rem;
      }

      .list-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 14px;
        margin-top: 18px;
      }

      .list-panel {
        padding: 16px;
        border-radius: 18px;
        border: 1px solid rgba(42, 52, 63, 0.08);
        background: rgba(255, 255, 255, 0.78);
      }

      .list-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }

      .list-head h4 {
        margin: 0;
        font-size: 1rem;
      }

      .list-head span {
        color: var(--muted);
        font-weight: 700;
      }

      .chip-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        min-height: 34px;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 0.9rem;
      }

      .chip code {
        word-break: break-all;
      }

      .chip-added {
        background: var(--added-bg);
        color: var(--added-text);
      }

      .chip-removed {
        background: var(--removed-bg);
        color: var(--removed-text);
      }

      .chip-current {
        background: var(--current-bg);
        color: var(--current-text);
      }

      .chip-baseline {
        background: var(--baseline-bg);
        color: var(--baseline-text);
      }

      .empty-state {
        margin: 0;
        line-height: 1.6;
      }

      code {
        font-family: "Cascadia Code", "Consolas", monospace;
      }

      @media (max-width: 900px) {
        .hero {
          grid-template-columns: 1fr;
        }

        .hero-actions {
          align-items: stretch;
        }
      }

      @media (max-width: 640px) {
        .container {
          padding-inline: 14px;
        }

        .hero,
        .section-block,
        .detail-card {
          padding: 18px;
        }

        thead {
          display: none;
        }

        table,
        tbody,
        tr,
        td {
          display: block;
          width: 100%;
        }

        tbody td {
          padding: 10px 0;
          border-top: 0;
        }

        tbody tr {
          padding: 14px 0;
          border-top: 1px solid rgba(42, 52, 63, 0.08);
        }

        tbody tr:first-child {
          border-top: 0;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <header class="hero">
        <div>
          <h1>Lazy-loading comparison report</h1>
          <p class="hero-subtitle">
            Static report generated from <code>${escapeHtml(path.basename(summaryPath))}</code>.
            Negative startup deltas mean fewer initial resources or less heap usage. Deferred sections
            show what moved out of the initial render path.
          </p>

          <dl class="meta-grid">
            <div>
              <dt>Generated at</dt>
              <dd>${escapeHtml(summary.generatedAt)}</dd>
            </div>
            <div>
              <dt>Baseline ref</dt>
              <dd><code>${escapeHtml(summary.baselineRef)}</code></dd>
            </div>
            <div>
              <dt>Output dir</dt>
              <dd><code>${escapeHtml(summary.outputDir)}</code></dd>
            </div>
          </dl>
        </div>

        <div class="hero-actions">
          <a class="hero-link" href="${toHref(path.basename(summaryPath))}">Open raw JSON</a>
        </div>
      </header>

      <section class="section-block">
        <h2>Overview</h2>
        <p class="section-note">
          Quick scan for the startup-heavy metrics. Use the detailed cards below when you need the exact
          chunk-level diff.
        </p>
        <div class="overview-grid">
          ${overviewCards.map(renderOverviewCard).join("")}
        </div>
      </section>

      <section class="section-block">
        <h2>Comparison matrix</h2>
        <p class="section-note">
          Each row is one probe checkpoint. For startup snapshots, heap delta shows current minus baseline.
        </p>
        <table>
          <thead>
            <tr>
              <th>Section</th>
              <th>Baseline</th>
              <th>Current</th>
              <th>Delta</th>
              <th>Heap delta</th>
              <th>Added</th>
              <th>Removed</th>
            </tr>
          </thead>
          <tbody>
            ${comparisonSections.map(renderSectionMatrixRow).join("")}
          </tbody>
        </table>
      </section>

      <section class="section-block">
        <h2>Resource details</h2>
        <p class="section-note">
          Added and removed lists already use the normalized names from <code>summary.json</code>, so build
          hash noise stays reduced.
        </p>
        <div class="detail-grid">
          ${detailCards}
        </div>
      </section>
    </div>
  </body>
</html>
`
}

function renderHistoryTableRow(entry, rootDir) {
  const popupInitial = entry.summary.comparison.popup.initial
  const optionsInitial = entry.summary.comparison.options.initial
  const popupDeferredBaseline =
    entry.summary.comparison.popup.bookmarksDeferred.baselineResources.length +
    entry.summary.comparison.popup.apiCredentialProfilesDeferred
      .baselineResources.length
  const popupDeferredCurrent =
    entry.summary.comparison.popup.bookmarksDeferred.currentResources.length +
    entry.summary.comparison.popup.apiCredentialProfilesDeferred
      .currentResources.length
  const optionsDeferredBaseline =
    entry.summary.comparison.options.usageAnalyticsDeferred.baselineResources
      .length
  const optionsDeferredCurrent =
    entry.summary.comparison.options.usageAnalyticsDeferred.currentResources
      .length
  const popupDeferredDelta = popupDeferredCurrent - popupDeferredBaseline
  const optionsDeferredDelta = optionsDeferredCurrent - optionsDeferredBaseline

  return `
    <tr>
      <td>
        <strong>${escapeHtml(path.basename(path.dirname(entry.summaryPath)))}</strong>
        <div class="row-links">
          <a href="${toHref(path.relative(rootDir, entry.htmlPath))}">HTML</a>
          <a href="${toHref(path.relative(rootDir, entry.summaryPath))}">JSON</a>
        </div>
      </td>
      <td>${escapeHtml(entry.summary.generatedAt)}</td>
      <td><code>${escapeHtml(entry.summary.baselineRef)}</code></td>
      <td class="${getDeltaClass(popupInitial.countDelta)}">${escapeHtml(
        formatSignedNumber(popupInitial.countDelta),
      )}</td>
      <td class="${getDeltaClass(popupInitial.heapDeltaBytes)}">${escapeHtml(
        formatSignedBytes(popupInitial.heapDeltaBytes),
      )}</td>
      <td class="${getDeltaClass(popupDeferredDelta)}">${escapeHtml(
        `${popupDeferredBaseline} -> ${popupDeferredCurrent} (${formatSignedNumber(popupDeferredDelta)})`,
      )}</td>
      <td class="${getDeltaClass(optionsInitial.countDelta)}">${escapeHtml(
        formatSignedNumber(optionsInitial.countDelta),
      )}</td>
      <td class="${getDeltaClass(optionsInitial.heapDeltaBytes)}">${escapeHtml(
        formatSignedBytes(optionsInitial.heapDeltaBytes),
      )}</td>
      <td class="${getDeltaClass(optionsDeferredDelta)}">${escapeHtml(
        `${optionsDeferredBaseline} -> ${optionsDeferredCurrent} (${formatSignedNumber(optionsDeferredDelta)})`,
      )}</td>
    </tr>
  `
}

function renderHistoryHtml(rootDir, entries) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lazy-loading comparison history</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #faf3e8;
        --text: #182026;
        --muted: #5e6975;
        --panel: rgba(255, 255, 255, 0.9);
        --line: rgba(42, 52, 63, 0.12);
        --shadow: 0 18px 40px rgba(62, 47, 29, 0.12);
        --positive: #9b3a28;
        --negative: #196545;
        --neutral: #61584c;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top right, rgba(222, 194, 147, 0.3), transparent 24%),
          linear-gradient(180deg, #f8ecd9, var(--bg));
        color: var(--text);
        font-family: "Aptos", "Segoe UI", sans-serif;
      }

      .container {
        max-width: 1500px;
        margin: 0 auto;
        padding: 32px 20px 56px;
      }

      .hero,
      .panel {
        padding: 24px;
        border: 1px solid var(--line);
        border-radius: 24px;
        background: var(--panel);
        box-shadow: var(--shadow);
      }

      .hero h1 {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", serif;
        font-size: clamp(2rem, 4vw, 3rem);
      }

      .hero p,
      .panel p {
        color: var(--muted);
        line-height: 1.6;
      }

      .meta-row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 16px;
      }

      .meta-pill {
        display: inline-flex;
        align-items: center;
        min-height: 40px;
        padding: 0 14px;
        border-radius: 999px;
        background: rgba(31, 62, 82, 0.08);
        color: var(--muted);
      }

      .panel {
        margin-top: 24px;
      }

      .panel h2 {
        margin: 0;
      }

      table {
        width: 100%;
        margin-top: 18px;
        border-collapse: collapse;
      }

      th,
      td {
        padding: 14px 12px;
        border-top: 1px solid rgba(42, 52, 63, 0.08);
        text-align: left;
        vertical-align: top;
      }

      th {
        font-size: 0.84rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .row-links {
        display: flex;
        gap: 10px;
        margin-top: 8px;
      }

      a {
        color: #1f4964;
        text-decoration: none;
        font-weight: 600;
      }

      .delta-positive {
        color: var(--positive);
      }

      .delta-negative {
        color: var(--negative);
      }

      .delta-neutral {
        color: var(--neutral);
      }

      code {
        font-family: "Cascadia Code", "Consolas", monospace;
      }

      @media (max-width: 720px) {
        .container {
          padding-inline: 14px;
        }

        .hero,
        .panel {
          padding: 18px;
        }

        table,
        thead,
        tbody,
        tr,
        th,
        td {
          display: block;
          width: 100%;
        }

        thead {
          display: none;
        }

        tr {
          padding: 12px 0;
          border-top: 1px solid rgba(42, 52, 63, 0.08);
        }

        td,
        th {
          padding: 8px 0;
          border-top: 0;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <section class="hero">
        <h1>Lazy-loading comparison history</h1>
        <p>
          Aggregated view for every <code>summary.json</code> under
          <code>${escapeHtml(rootDir)}</code>. Newer reports are listed first, and each row links to the
          generated HTML drill-down.
        </p>
        <div class="meta-row">
          <span class="meta-pill">${entries.length} report${entries.length === 1 ? "" : "s"}</span>
          <span class="meta-pill">Startup deltas: negative is lighter</span>
          <span class="meta-pill">Deferred deltas: positive means more resources shifted later</span>
        </div>
      </section>

      <section class="panel">
        <h2>Runs</h2>
        <p>Use this view when several timestamped runs exist and raw JSON is too noisy to compare directly.</p>
        <table>
          <thead>
            <tr>
              <th>Report</th>
              <th>Generated at</th>
              <th>Baseline</th>
              <th>Popup init delta</th>
              <th>Popup heap delta</th>
              <th>Popup deferred</th>
              <th>Options init delta</th>
              <th>Options heap delta</th>
              <th>Options deferred</th>
            </tr>
          </thead>
          <tbody>
            ${
              entries.length === 0
                ? `<tr><td colspan="9">No summary files found yet.</td></tr>`
                : entries
                    .map((entry) => renderHistoryTableRow(entry, rootDir))
                    .join("")
            }
          </tbody>
        </table>
      </section>
    </div>
  </body>
</html>
`
}

async function collectSummaryPaths(rootDir) {
  const items = await fs.readdir(rootDir, { withFileTypes: true })
  const summaryPaths = []

  for (const item of items) {
    const itemPath = path.join(rootDir, item.name)

    if (item.isDirectory()) {
      summaryPaths.push(...(await collectSummaryPaths(itemPath)))
      continue
    }

    if (item.isFile() && item.name === "summary.json") {
      summaryPaths.push(itemPath)
    }
  }

  return summaryPaths
}

async function readSummary(summaryPath) {
  return JSON.parse(await fs.readFile(summaryPath, "utf8"))
}

/**
 * Write a static HTML report next to a summary.json file.
 */
export async function writeSummaryReport(summaryPath, summary = null) {
  const resolvedSummaryPath = path.resolve(summaryPath)
  const resolvedSummary = summary ?? (await readSummary(resolvedSummaryPath))
  const htmlPath = path.join(path.dirname(resolvedSummaryPath), "summary.html")

  await fs.writeFile(
    htmlPath,
    renderSummaryHtml(resolvedSummary, resolvedSummaryPath),
    "utf8",
  )

  return htmlPath
}

/**
 * Scan a lazy-loading result root, refresh per-run HTML reports, and write an index.
 */
export async function writeHistoryReport(rootDir) {
  const resolvedRootDir = path.resolve(rootDir)
  await fs.mkdir(resolvedRootDir, { recursive: true })

  const summaryPaths = await collectSummaryPaths(resolvedRootDir)
  const entries = []

  for (const summaryPath of summaryPaths) {
    const summary = await readSummary(summaryPath)
    const htmlPath = await writeSummaryReport(summaryPath, summary)
    entries.push({
      summary,
      summaryPath,
      htmlPath,
    })
  }

  entries.sort((left, right) =>
    String(right.summary.generatedAt ?? "").localeCompare(
      String(left.summary.generatedAt ?? ""),
    ),
  )

  const indexPath = path.join(resolvedRootDir, "index.html")
  await fs.writeFile(
    indexPath,
    renderHistoryHtml(resolvedRootDir, entries),
    "utf8",
  )

  return {
    indexPath,
    count: entries.length,
  }
}
