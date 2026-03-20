/* eslint-disable jsdoc/require-jsdoc */
import fs from "node:fs/promises"
import path from "node:path"

const comparisonSectionConfigs = [
  {
    id: "build-artifacts",
    title: "Build artifacts",
    kind: "artifacts",
    getSection(summary) {
      return summary.comparison.buildArtifacts
    },
  },
  {
    id: "popup-startup",
    title: "Popup startup",
    kind: "page",
    getSection(summary) {
      return summary.comparison.popup
    },
  },
  {
    id: "options-startup",
    title: "Options startup",
    kind: "page",
    getSection(summary) {
      return summary.comparison.options
    },
  },
  {
    id: "content-script-impact",
    title: "Content script impact",
    kind: "content-impact",
    getSection(summary) {
      return summary.comparison.contentScriptImpact
    },
  },
]

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
    return "neutral"
  }

  return value > 0 ? "positive" : "negative"
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

function renderMetricRows(metrics) {
  return metrics
    .map((metric) => {
      const valueFormatter = metric.valueFormatter ?? ((value) => String(value))
      const deltaFormatter = metric.deltaFormatter ?? valueFormatter
      return `
        <tr>
          <td>${escapeHtml(metric.label)}</td>
          <td>${escapeHtml(valueFormatter(metric.value.baseline))}</td>
          <td>${escapeHtml(valueFormatter(metric.value.current))}</td>
          <td class="${getDeltaClass(metric.value.delta)}">${escapeHtml(
            deltaFormatter(metric.value.delta),
          )}</td>
        </tr>
      `
    })
    .join("")
}

function renderListPanel(title, items, emptyLabel) {
  const body =
    items.length === 0
      ? `<p class="muted">${escapeHtml(emptyLabel)}</p>`
      : `<ul>${items.map((item) => `<li><code>${escapeHtml(item)}</code></li>`).join("")}</ul>`

  return `
    <section class="list-panel">
      <h4>${escapeHtml(title)}</h4>
      ${body}
    </section>
  `
}

function renderSection({ title, kind, section }) {
  if (kind === "artifacts") {
    return `
      <article class="card">
        <h3>${escapeHtml(title)}</h3>
        <table>
          <thead>
            <tr><th>Metric</th><th>Baseline</th><th>Current</th><th>Delta</th></tr>
          </thead>
          <tbody>
            ${renderMetricRows([
              {
                label: "Background bundle",
                value: section.backgroundBundleBytes,
                valueFormatter: formatBytes,
                deltaFormatter: formatSignedBytes,
              },
              {
                label: "Content script bundle",
                value: section.contentScriptBundleBytes,
                valueFormatter: formatBytes,
                deltaFormatter: formatSignedBytes,
              },
            ])}
          </tbody>
        </table>
      </article>
    `
  }

  if (kind === "content-impact") {
    return `
      <article class="card">
        <h3>${escapeHtml(title)}</h3>
        <p class="muted">Measured on <code>${escapeHtml(section.targetUrl)}</code>.</p>
        <table>
          <thead>
            <tr><th>Metric</th><th>Baseline</th><th>Current</th><th>Delta</th></tr>
          </thead>
          <tbody>
            ${renderMetricRows([
              {
                label: "Runtime heap overhead",
                value: section.runtimeUsedSizeDelta,
                valueFormatter: formatBytes,
                deltaFormatter: formatSignedBytes,
              },
              {
                label: "Embedder heap overhead",
                value: section.embedderHeapUsedSizeDelta,
                valueFormatter: formatBytes,
                deltaFormatter: formatSignedBytes,
              },
              {
                label: "Backing storage overhead",
                value: section.backingStorageSizeDelta,
                valueFormatter: formatBytes,
                deltaFormatter: formatSignedBytes,
              },
              {
                label: "Perf JS heap overhead",
                value: section.perfUsedJSHeapSizeDelta,
                valueFormatter: formatBytes,
                deltaFormatter: formatSignedBytes,
              },
              {
                label: "DOM nodes overhead",
                value: section.nodesDelta,
                deltaFormatter: formatSignedNumber,
              },
              {
                label: "Listener overhead",
                value: section.jsEventListenersDelta,
                deltaFormatter: formatSignedNumber,
              },
            ])}
          </tbody>
        </table>
      </article>
    `
  }

  return `
    <article class="card">
      <h3>${escapeHtml(title)}</h3>
      <table>
        <thead>
          <tr><th>Metric</th><th>Baseline</th><th>Current</th><th>Delta</th></tr>
        </thead>
        <tbody>
          ${renderMetricRows([
            {
              label: "Startup JS bytes",
              value: section.startupJsBytes,
              valueFormatter: formatBytes,
              deltaFormatter: formatSignedBytes,
            },
            {
              label: "Startup CSS bytes",
              value: section.startupCssBytes,
              valueFormatter: formatBytes,
              deltaFormatter: formatSignedBytes,
            },
            {
              label: "Local resources",
              value: section.localResourceCount,
              deltaFormatter: formatSignedNumber,
            },
            {
              label: "External requests",
              value: section.externalRequestCount,
              deltaFormatter: formatSignedNumber,
            },
            {
              label: "Runtime heap",
              value: section.runtimeUsedSize,
              valueFormatter: formatBytes,
              deltaFormatter: formatSignedBytes,
            },
            {
              label: "Embedder heap",
              value: section.embedderHeapUsedSize,
              valueFormatter: formatBytes,
              deltaFormatter: formatSignedBytes,
            },
            {
              label: "Backing storage",
              value: section.backingStorageSize,
              valueFormatter: formatBytes,
              deltaFormatter: formatSignedBytes,
            },
            {
              label: "Perf JS heap",
              value: section.perfUsedJSHeapSize,
              valueFormatter: formatBytes,
              deltaFormatter: formatSignedBytes,
            },
            {
              label: "DOM nodes",
              value: section.nodes,
              deltaFormatter: formatSignedNumber,
            },
            {
              label: "JS listeners",
              value: section.jsEventListeners,
              deltaFormatter: formatSignedNumber,
            },
          ])}
        </tbody>
      </table>
      <div class="list-grid">
        ${renderListPanel(
          "Added startup resources",
          section.addedResources,
          "No startup resources added.",
        )}
        ${renderListPanel(
          "Removed startup resources",
          section.removedResources,
          "No startup resources removed.",
        )}
        ${renderListPanel(
          "Added external requests",
          section.addedExternalRequests,
          "No new external requests.",
        )}
        ${renderListPanel(
          "Removed external requests",
          section.removedExternalRequests,
          "No external requests removed.",
        )}
      </div>
    </article>
  `
}

export function getComparisonSections(summary) {
  return comparisonSectionConfigs.map((config) => ({
    ...config,
    section: config.getSection(summary),
  }))
}

function renderSummaryHtml(summary, summaryPath) {
  const comparisonSections = getComparisonSections(summary)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Extension memory comparison report</title>
    <style>
      body { margin: 0; font-family: "Segoe UI", sans-serif; background: #f5f2eb; color: #1d252c; }
      .wrap { max-width: 1280px; margin: 0 auto; padding: 24px; }
      .hero, .card { background: #fff; border: 1px solid #ddd3c3; border-radius: 16px; padding: 20px; box-shadow: 0 8px 20px rgba(0,0,0,0.05); }
      .hero h1, .card h3 { margin-top: 0; }
      .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 16px; }
      .meta div { background: #faf7f0; border: 1px solid #e4dac8; border-radius: 12px; padding: 12px; }
      .grid { display: grid; gap: 16px; margin-top: 20px; }
      .overview { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 16px; }
      .pill { background: #faf7f0; border: 1px solid #e4dac8; border-radius: 12px; padding: 12px; }
      .muted { color: #5f6b76; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { text-align: left; padding: 10px 8px; border-top: 1px solid #eee3d2; vertical-align: top; }
      th { color: #5f6b76; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
      .positive { color: #9b3a28; }
      .negative { color: #196545; }
      .neutral { color: #5f5443; }
      .list-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 16px; }
      .list-panel { background: #faf7f0; border: 1px solid #e4dac8; border-radius: 12px; padding: 12px; }
      ul { margin: 0; padding-left: 18px; }
      code { font-family: Consolas, monospace; word-break: break-all; }
      a { color: #1f4964; text-decoration: none; font-weight: 600; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <section class="hero">
        <h1>Extension memory comparison report</h1>
        <p class="muted">
          Negative deltas mean the current branch is lighter for that metric. This report compares popup,
          options, build artifacts, and neutral-page content-script overhead.
        </p>
        <p><a href="${toHref(path.basename(summaryPath))}">Open raw JSON</a></p>
        <div class="meta">
          <div><strong>Generated</strong><br />${escapeHtml(summary.generatedAt)}</div>
          <div><strong>Baseline</strong><br /><code>${escapeHtml(summary.baselineRef)}</code></div>
          <div><strong>Target URL</strong><br /><code>${escapeHtml(summary.targetUrl)}</code></div>
          <div><strong>Output dir</strong><br /><code>${escapeHtml(summary.outputDir)}</code></div>
        </div>
        <div class="overview">
          <div class="pill"><strong>Popup heap</strong><br /><span class="${getDeltaClass(
            summary.comparison.popup.runtimeUsedSize.delta,
          )}">${escapeHtml(
            formatSignedBytes(summary.comparison.popup.runtimeUsedSize.delta),
          )}</span></div>
          <div class="pill"><strong>Options heap</strong><br /><span class="${getDeltaClass(
            summary.comparison.options.runtimeUsedSize.delta,
          )}">${escapeHtml(
            formatSignedBytes(summary.comparison.options.runtimeUsedSize.delta),
          )}</span></div>
          <div class="pill"><strong>Content impact</strong><br /><span class="${getDeltaClass(
            summary.comparison.contentScriptImpact.runtimeUsedSizeDelta.delta,
          )}">${escapeHtml(
            formatSignedBytes(
              summary.comparison.contentScriptImpact.runtimeUsedSizeDelta.delta,
            ),
          )}</span></div>
          <div class="pill"><strong>Content bundle</strong><br /><span class="${getDeltaClass(
            summary.comparison.buildArtifacts.contentScriptBundleBytes.delta,
          )}">${escapeHtml(
            formatSignedBytes(
              summary.comparison.buildArtifacts.contentScriptBundleBytes.delta,
            ),
          )}</span></div>
        </div>
      </section>
      <section class="grid">
        ${comparisonSections.map(renderSection).join("")}
      </section>
    </div>
  </body>
</html>
`
}

function renderHistoryTableRow(entry, rootDir) {
  return `
    <tr>
      <td>
        <strong>${escapeHtml(path.basename(path.dirname(entry.summaryPath)))}</strong><br />
        <a href="${toHref(path.relative(rootDir, entry.htmlPath))}">HTML</a>
        <a href="${toHref(path.relative(rootDir, entry.summaryPath))}">JSON</a>
      </td>
      <td>${escapeHtml(entry.summary.generatedAt)}</td>
      <td><code>${escapeHtml(entry.summary.baselineRef)}</code></td>
      <td class="${getDeltaClass(
        entry.summary.comparison.popup.runtimeUsedSize.delta,
      )}">${escapeHtml(
        formatSignedBytes(entry.summary.comparison.popup.runtimeUsedSize.delta),
      )}</td>
      <td class="${getDeltaClass(
        entry.summary.comparison.options.runtimeUsedSize.delta,
      )}">${escapeHtml(
        formatSignedBytes(
          entry.summary.comparison.options.runtimeUsedSize.delta,
        ),
      )}</td>
      <td class="${getDeltaClass(
        entry.summary.comparison.contentScriptImpact.runtimeUsedSizeDelta.delta,
      )}">${escapeHtml(
        formatSignedBytes(
          entry.summary.comparison.contentScriptImpact.runtimeUsedSizeDelta
            .delta,
        ),
      )}</td>
      <td class="${getDeltaClass(
        entry.summary.comparison.buildArtifacts.backgroundBundleBytes.delta,
      )}">${escapeHtml(
        formatSignedBytes(
          entry.summary.comparison.buildArtifacts.backgroundBundleBytes.delta,
        ),
      )}</td>
      <td class="${getDeltaClass(
        entry.summary.comparison.buildArtifacts.contentScriptBundleBytes.delta,
      )}">${escapeHtml(
        formatSignedBytes(
          entry.summary.comparison.buildArtifacts.contentScriptBundleBytes
            .delta,
        ),
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
    <title>Extension memory comparison history</title>
    <style>
      body { margin: 0; font-family: "Segoe UI", sans-serif; background: #f5f2eb; color: #1d252c; }
      .wrap { max-width: 1400px; margin: 0 auto; padding: 24px; }
      .hero, .panel { background: #fff; border: 1px solid #ddd3c3; border-radius: 16px; padding: 20px; box-shadow: 0 8px 20px rgba(0,0,0,0.05); }
      .panel { margin-top: 20px; }
      .muted { color: #5f6b76; }
      .positive { color: #9b3a28; }
      .negative { color: #196545; }
      .neutral { color: #5f5443; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { text-align: left; padding: 10px 8px; border-top: 1px solid #eee3d2; vertical-align: top; }
      th { color: #5f6b76; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
      code { font-family: Consolas, monospace; }
      a { color: #1f4964; text-decoration: none; font-weight: 600; margin-right: 8px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <section class="hero">
        <h1>Extension memory comparison history</h1>
        <p class="muted">
          Aggregated view for every <code>summary.json</code> under <code>${escapeHtml(
            rootDir,
          )}</code>. Newer reports are listed first.
        </p>
      </section>
      <section class="panel">
        <h2>Runs</h2>
        <table>
          <thead>
            <tr>
              <th>Report</th>
              <th>Generated at</th>
              <th>Baseline</th>
              <th>Popup heap delta</th>
              <th>Options heap delta</th>
              <th>Content impact delta</th>
              <th>Background bundle</th>
              <th>Content bundle</th>
            </tr>
          </thead>
          <tbody>
            ${
              entries.length === 0
                ? `<tr><td colspan="8">No summary files found yet.</td></tr>`
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
  const excludedDirectoryNames = new Set([
    "baseline-src",
    "node_modules",
    ".git",
  ])

  for (const item of items) {
    if (item.isDirectory() && excludedDirectoryNames.has(item.name)) {
      continue
    }

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
