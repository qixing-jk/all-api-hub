/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns */
import fs from "node:fs/promises"
import path from "node:path"

import {
  copyFilesToDir,
  ensureCleanDir,
  materializeBaselineSource,
  pathExists,
  resolveBaseline,
  runCommand,
} from "./compare-worktree-utils.mjs"
import {
  formatBytes,
  writeHistoryReport,
  writeSummaryReport,
} from "./extension-memory-report-utils.mjs"

const repoRoot = process.cwd()

/**
 * Parse CLI flags for the memory comparison runner.
 */
function parseArgs(argv) {
  const options = {
    baseline: null,
    baselineExplicit: false,
    outputDir: null,
    skipCurrentBuild: false,
    skipBaselineBuild: false,
    targetUrl: "https://example.com/",
  }

  for (const arg of argv) {
    if (arg.startsWith("--baseline=")) {
      options.baseline = arg.slice("--baseline=".length) || "HEAD"
      options.baselineExplicit = true
      continue
    }

    if (arg.startsWith("--output-dir=")) {
      options.outputDir = arg.slice("--output-dir=".length) || null
      continue
    }

    if (arg.startsWith("--web-url=")) {
      options.targetUrl = arg.slice("--web-url=".length) || options.targetUrl
      continue
    }

    if (arg === "--skip-current-build") {
      options.skipCurrentBuild = true
      continue
    }

    if (arg === "--skip-baseline-build") {
      options.skipBaselineBuild = true
    }
  }

  return options
}

/**
 * Return a sorted unique list.
 */
function unique(items) {
  return Array.from(new Set(items)).sort()
}

/**
 * Compute added and removed values between baseline and current lists.
 */
function diffLists(baseline, current) {
  const baselineSet = new Set(baseline)
  const currentSet = new Set(current)

  return {
    added: current.filter((item) => !baselineSet.has(item)),
    removed: baseline.filter((item) => !currentSet.has(item)),
  }
}

/**
 * Compare a single numeric metric.
 */
function compareNumericMetric(baseline, current) {
  return {
    baseline,
    current,
    delta:
      Number.isFinite(baseline) && Number.isFinite(current)
        ? current - baseline
        : null,
  }
}

/**
 * Compare the popup/options startup snapshots between baseline and current.
 */
function comparePageSnapshot(baseline, current) {
  const localResourceDiff = diffLists(
    unique(baseline.resources.local.map((resource) => resource.normalizedPath)),
    unique(current.resources.local.map((resource) => resource.normalizedPath)),
  )
  const externalRequestDiff = diffLists(
    unique(
      baseline.resources.external.map((resource) => resource.normalizedUrl),
    ),
    unique(
      current.resources.external.map((resource) => resource.normalizedUrl),
    ),
  )

  return {
    pagePath: current.pagePath,
    startupJsBytes: compareNumericMetric(
      baseline.resources.startupJsBytes,
      current.resources.startupJsBytes,
    ),
    startupCssBytes: compareNumericMetric(
      baseline.resources.startupCssBytes,
      current.resources.startupCssBytes,
    ),
    localResourceCount: compareNumericMetric(
      baseline.resources.localCount,
      current.resources.localCount,
    ),
    externalRequestCount: compareNumericMetric(
      baseline.resources.externalCount,
      current.resources.externalCount,
    ),
    runtimeUsedSize: compareNumericMetric(
      baseline.memory.runtimeUsedSize,
      current.memory.runtimeUsedSize,
    ),
    embedderHeapUsedSize: compareNumericMetric(
      baseline.memory.embedderHeapUsedSize,
      current.memory.embedderHeapUsedSize,
    ),
    backingStorageSize: compareNumericMetric(
      baseline.memory.backingStorageSize,
      current.memory.backingStorageSize,
    ),
    perfUsedJSHeapSize: compareNumericMetric(
      baseline.memory.perfUsedJSHeapSize,
      current.memory.perfUsedJSHeapSize,
    ),
    nodes: compareNumericMetric(baseline.dom.nodes, current.dom.nodes),
    jsEventListeners: compareNumericMetric(
      baseline.dom.jsEventListeners,
      current.dom.jsEventListeners,
    ),
    addedResources: localResourceDiff.added,
    removedResources: localResourceDiff.removed,
    addedExternalRequests: externalRequestDiff.added,
    removedExternalRequests: externalRequestDiff.removed,
  }
}

/**
 * Compare the built always-on background/content bundles.
 */
function compareBuildArtifacts(baseline, current) {
  return {
    backgroundBundleBytes: compareNumericMetric(
      baseline.backgroundBundleBytes,
      current.backgroundBundleBytes,
    ),
    contentScriptBundleBytes: compareNumericMetric(
      baseline.contentScriptBundleBytes,
      current.contentScriptBundleBytes,
    ),
  }
}

/**
 * Compare the content-script overhead deltas between baseline and current.
 */
function compareContentScriptImpact(baseline, current) {
  return {
    targetUrl: current.targetUrl,
    runtimeUsedSizeDelta: compareNumericMetric(
      baseline.delta.runtimeUsedSize,
      current.delta.runtimeUsedSize,
    ),
    embedderHeapUsedSizeDelta: compareNumericMetric(
      baseline.delta.embedderHeapUsedSize,
      current.delta.embedderHeapUsedSize,
    ),
    backingStorageSizeDelta: compareNumericMetric(
      baseline.delta.backingStorageSize,
      current.delta.backingStorageSize,
    ),
    perfUsedJSHeapSizeDelta: compareNumericMetric(
      baseline.delta.perfUsedJSHeapSize,
      current.delta.perfUsedJSHeapSize,
    ),
    nodesDelta: compareNumericMetric(baseline.delta.nodes, current.delta.nodes),
    jsEventListenersDelta: compareNumericMetric(
      baseline.delta.jsEventListeners,
      current.delta.jsEventListeners,
    ),
  }
}

/**
 * Read and parse a JSON file.
 */
async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"))
}

/**
 * Resolve the actual built extension directory after a build step.
 */
async function resolveBuiltExtensionDir(preferredDir) {
  const manifestPath = path.join(preferredDir, "manifest.json")
  if (await pathExists(manifestPath)) {
    return preferredDir
  }

  const fallbackDir = path.join(repoRoot, ".output", "chrome-mv3")
  const fallbackManifestPath = path.join(fallbackDir, "manifest.json")

  if (await pathExists(fallbackManifestPath)) {
    return fallbackDir
  }

  throw new Error(
    `Unable to find built extension output. Checked '${preferredDir}' and '${fallbackDir}'.`,
  )
}

/**
 * Copy the current memory probe files into the baseline source tree.
 */
async function syncProbeFilesToBaseline(baselineSrcDir) {
  await copyFilesToDir(
    [
      "scripts/collect-extension-memory.mjs",
      "scripts/extension-memory-report-utils.mjs",
    ],
    baselineSrcDir,
  )
}

/**
 * Run the single-run memory collector and return the parsed JSON payload.
 */
async function runProbe({ cwd, outputDir, extensionDir = null, targetUrl }) {
  await ensureCleanDir(outputDir)

  const args = [
    "scripts/collect-extension-memory.mjs",
    `--output-dir=${outputDir}`,
    `--web-url=${targetUrl}`,
  ]

  if (extensionDir) {
    args.push(`--extension-dir=${extensionDir}`)
  }

  await runCommand("node", args, { cwd })
  return await readJson(path.join(outputDir, "report.json"))
}

function formatSignedBytes(value) {
  if (!Number.isFinite(value)) {
    return "n/a"
  }

  return `${value > 0 ? "+" : ""}${formatBytes(value)}`
}

function formatSignedNumber(value) {
  if (!Number.isFinite(value)) {
    return "n/a"
  }

  return `${value > 0 ? "+" : ""}${value}`
}

/**
 * Print a concise human-readable comparison summary.
 */
function printComparison(summary) {
  console.log("")
  console.log("Extension memory comparison summary")
  console.log(`Baseline ref: ${summary.baselineRef}`)
  console.log(`Output dir: ${summary.outputDir}`)
  console.log("")

  console.log(
    `Popup: runtime heap ${formatSignedBytes(summary.comparison.popup.runtimeUsedSize.delta)}, embedder ${formatSignedBytes(summary.comparison.popup.embedderHeapUsedSize.delta)}, startup JS ${formatSignedBytes(summary.comparison.popup.startupJsBytes.delta)}, listeners ${formatSignedNumber(summary.comparison.popup.jsEventListeners.delta)}`,
  )
  console.log(
    `Options: runtime heap ${formatSignedBytes(summary.comparison.options.runtimeUsedSize.delta)}, embedder ${formatSignedBytes(summary.comparison.options.embedderHeapUsedSize.delta)}, startup JS ${formatSignedBytes(summary.comparison.options.startupJsBytes.delta)}, listeners ${formatSignedNumber(summary.comparison.options.jsEventListeners.delta)}`,
  )
  console.log(
    `Content script impact: runtime heap ${formatSignedBytes(summary.comparison.contentScriptImpact.runtimeUsedSizeDelta.delta)}, listeners ${formatSignedNumber(summary.comparison.contentScriptImpact.jsEventListenersDelta.delta)}, nodes ${formatSignedNumber(summary.comparison.contentScriptImpact.nodesDelta.delta)}`,
  )
  console.log(
    `Built bundles: background ${formatSignedBytes(summary.comparison.buildArtifacts.backgroundBundleBytes.delta)}, content script ${formatSignedBytes(summary.comparison.buildArtifacts.contentScriptBundleBytes.delta)}`,
  )
}

/**
 * Build baseline/current artifacts, run probes, and write a combined summary.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2))
  const baselineRef = await resolveBaseline(options)
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const outputDir = path.resolve(
    options.outputDir ??
      path.join("extension-memory-compare-results", timestamp),
  )
  const baselineSrcDir = path.join(outputDir, "baseline-src")
  const baselineArchivePath = path.join(outputDir, "baseline.tar")
  const baselineReportDir = path.join(outputDir, "baseline-report")
  const currentReportDir = path.join(outputDir, "current-report")
  const currentBuildDir = path.join(repoRoot, ".output", "chrome-mv3")

  await ensureCleanDir(outputDir)
  await materializeBaselineSource({
    baselineRef,
    baselineSrcDir,
    tarPath: baselineArchivePath,
  })
  await syncProbeFilesToBaseline(baselineSrcDir)

  if (!options.skipBaselineBuild) {
    console.log(`Building baseline ref '${baselineRef}'...`)
    await runCommand("pnpm", ["build"], { cwd: baselineSrcDir })
  }

  console.log("Running baseline memory probe...")
  const baselineReport = await runProbe({
    cwd: baselineSrcDir,
    outputDir: baselineReportDir,
    targetUrl: options.targetUrl,
  })

  if (!options.skipCurrentBuild) {
    console.log("Building current workspace...")
    await runCommand("pnpm", ["build"])
  }

  const resolvedCurrentBuildDir =
    await resolveBuiltExtensionDir(currentBuildDir)

  console.log("Running current memory probe...")
  const currentReport = await runProbe({
    cwd: repoRoot,
    outputDir: currentReportDir,
    extensionDir: resolvedCurrentBuildDir,
    targetUrl: options.targetUrl,
  })

  const summary = {
    generatedAt: new Date().toISOString(),
    baselineRef,
    outputDir,
    targetUrl: options.targetUrl,
    baseline: baselineReport,
    current: currentReport,
    comparison: {
      buildArtifacts: compareBuildArtifacts(
        baselineReport.buildArtifacts,
        currentReport.buildArtifacts,
      ),
      popup: comparePageSnapshot(baselineReport.popup, currentReport.popup),
      options: comparePageSnapshot(
        baselineReport.options,
        currentReport.options,
      ),
      contentScriptImpact: compareContentScriptImpact(
        baselineReport.contentScriptImpact,
        currentReport.contentScriptImpact,
      ),
    },
  }

  const summaryPath = path.join(outputDir, "summary.json")
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8")

  const summaryHtmlPath = await writeSummaryReport(summaryPath, summary)
  const historyReport = await writeHistoryReport(path.dirname(outputDir))

  printComparison(summary)
  console.log(`Summary written to ${summaryPath}`)
  console.log(`HTML report written to ${summaryHtmlPath}`)
  console.log(
    `History index refreshed at ${historyReport.indexPath} (${historyReport.count} report${historyReport.count === 1 ? "" : "s"})`,
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
