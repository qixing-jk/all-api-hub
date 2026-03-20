/* eslint-disable jsdoc/require-param, jsdoc/require-returns */
import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"

import {
  formatBytes,
  getComparisonSections,
  writeHistoryReport,
  writeSummaryReport,
} from "./lazy-loading-report-utils.mjs"

const repoRoot = process.cwd()

/**
 * Parse CLI flags for the lazy-loading comparison runner.
 */
function parseArgs(argv) {
  const options = {
    baseline: null,
    baselineExplicit: false,
    outputDir: null,
    skipCurrentBuild: false,
    skipBaselineBuild: false,
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
 * Strip hashed suffixes from built asset names so cross-build diffs stay readable.
 */
function normalizeResourceName(resource) {
  return resource.replace(
    /(.+)-([A-Za-z0-9_]{6,})(\.(?:js|css|png|svg|jpg|jpeg|webp))$/i,
    "$1$3",
  )
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
 * Compare two full resource snapshots.
 */
function compareSnapshot(baseline, current) {
  const resourceDiff = diffLists(
    unique(baseline.resources.map(normalizeResourceName)),
    unique(current.resources.map(normalizeResourceName)),
  )
  const baselineHeap = baseline.memory?.usedJSHeapSize ?? null
  const currentHeap = current.memory?.usedJSHeapSize ?? null

  return {
    baselineCount: baseline.resourceCount,
    currentCount: current.resourceCount,
    countDelta: current.resourceCount - baseline.resourceCount,
    addedResources: resourceDiff.added,
    removedResources: resourceDiff.removed,
    baselineHeapBytes: baselineHeap,
    currentHeapBytes: currentHeap,
    heapDeltaBytes:
      baselineHeap !== null && currentHeap !== null
        ? currentHeap - baselineHeap
        : null,
  }
}

/**
 * Compare two deferred-resource groups.
 */
function compareDeferred(baselineDelta, currentDelta) {
  const baselineResources = unique(
    baselineDelta.newResources.map(normalizeResourceName),
  )
  const currentResources = unique(
    currentDelta.newResources.map(normalizeResourceName),
  )
  const resourceDiff = diffLists(baselineResources, currentResources)

  return {
    baselineResources,
    currentResources,
    addedResources: resourceDiff.added,
    removedResources: resourceDiff.removed,
  }
}

/**
 * Spawn a child process and stream output to the current terminal.
 */
async function runCommand(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: "inherit",
      shell: process.platform === "win32",
    })

    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(
        new Error(
          `Command failed (${code ?? "unknown"}): ${command} ${args.join(" ")}`,
        ),
      )
    })
  })
}

/**
 * Spawn a child process and capture stdout/stderr for decision-making.
 */
async function runCommandCapture(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    })

    let stdout = ""
    let stderr = ""

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk)
    })

    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code })
        return
      }
      reject(
        new Error(
          `Command failed (${code ?? "unknown"}): ${command} ${args.join(" ")}\n${stderr || stdout}`,
        ),
      )
    })
  })
}

/**
 * Recreate a directory from scratch.
 */
async function ensureCleanDir(dir) {
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })
}

/**
 * Check whether a path exists.
 */
async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

/**
 * Returns whether the current worktree has no tracked or untracked changes.
 */
async function isWorktreeClean() {
  const result = await runCommandCapture("git", ["status", "--porcelain"])
  return result.stdout.trim() === ""
}

/**
 * Returns whether a git ref can be resolved locally.
 */
async function gitRefExists(ref) {
  try {
    await runCommandCapture("git", ["rev-parse", "--verify", ref])
    return true
  } catch {
    return false
  }
}

/**
 * Pick a baseline when the caller did not pass one explicitly.
 */
async function resolveBaseline(options) {
  if (options.baselineExplicit && options.baseline) {
    console.log(`Using explicit baseline ref '${options.baseline}'.`)
    return options.baseline
  }

  const cleanWorktree = await isWorktreeClean()

  if (cleanWorktree && (await gitRefExists("origin/main"))) {
    console.log(
      "No --baseline specified. Worktree is clean and 'origin/main' exists, so using 'origin/main'.",
    )
    return "origin/main"
  }

  if (cleanWorktree && (await gitRefExists("main"))) {
    console.log(
      "No --baseline specified. Worktree is clean and 'origin/main' is unavailable, so using 'main'.",
    )
    return "main"
  }

  console.log(
    "No --baseline specified. Falling back to 'HEAD' for local self-comparison because the worktree is dirty or no mainline ref is available.",
  )
  return "HEAD"
}

/**
 * Export the baseline git ref into a temp source directory.
 */
async function materializeBaselineSource({
  baselineRef,
  baselineSrcDir,
  tarPath,
}) {
  await ensureCleanDir(baselineSrcDir)
  await runCommand("git", [
    "archive",
    "--format=tar",
    baselineRef,
    `--output=${tarPath}`,
  ])
  await runCommand("tar", ["-xf", tarPath, "-C", baselineSrcDir])

  const baselineNodeModules = path.join(baselineSrcDir, "node_modules")
  await fs.rm(baselineNodeModules, { recursive: true, force: true })
  await fs.symlink(
    path.join(repoRoot, "node_modules"),
    baselineNodeModules,
    "junction",
  )
}

/**
 * Copy the current lazy-loading probe files into the baseline source tree.
 */
async function syncProbeFilesToBaseline(baselineSrcDir) {
  const filesToCopy = [
    "e2e/lazyEntryLoading.spec.ts",
    "e2e/fixtures/extensionTest.ts",
    "e2e/utils/extension.ts",
    "e2e/utils/lazyLoading.ts",
    "playwright.config.ts",
  ]

  for (const relativePath of filesToCopy) {
    const sourcePath = path.join(repoRoot, relativePath)
    const targetPath = path.join(baselineSrcDir, relativePath)

    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.copyFile(sourcePath, targetPath)
  }
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
 * Run the Playwright lazy-loading probe against a built extension directory.
 */
async function runProbe({ reportDir, cwd, extensionDir = null }) {
  await ensureCleanDir(reportDir)
  const probeCwd = cwd ?? repoRoot
  const relativeReportDir = path.relative(probeCwd, reportDir)
  const env = {
    AAH_LAZY_LOADING_REPORT_DIR: relativeReportDir,
    AAH_LAZY_LOADING_ASSERT: "0",
  }

  if (extensionDir) {
    env.AAH_EXTENSION_DIR = path.relative(probeCwd, extensionDir)
  }

  await runCommand(
    "pnpm",
    ["exec", "playwright", "test", "e2e/lazyEntryLoading.spec.ts"],
    {
      cwd: probeCwd,
      env,
    },
  )

  return await resolveProbeReportDir(probeCwd, reportDir)
}

/**
 * Read and parse a JSON file.
 */
async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"))
}

/**
 * Resolve where the probe JSON files were actually written.
 */
async function resolveProbeReportDir(probeCwd, requestedReportDir) {
  const requestedPopupReport = path.join(
    requestedReportDir,
    "popup-lazy-loading-report.json",
  )

  if (await pathExists(requestedPopupReport)) {
    return requestedReportDir
  }

  const fallbackDir = path.join(probeCwd, "test-results", "lazy-loading-report")
  const fallbackPopupReport = path.join(
    fallbackDir,
    "popup-lazy-loading-report.json",
  )

  if (await pathExists(fallbackPopupReport)) {
    return fallbackDir
  }

  throw new Error(
    `Unable to locate probe reports. Checked '${requestedReportDir}' and '${fallbackDir}'.`,
  )
}

/**
 * Print a concise human-readable comparison summary.
 */
function printComparison(summary) {
  console.log("")
  console.log("Lazy-loading comparison summary")
  console.log(`Baseline ref: ${summary.baselineRef}`)
  console.log(`Output dir: ${summary.outputDir}`)
  console.log("")

  for (const { title, section } of getComparisonSections(summary)) {
    console.log(title)

    if ("countDelta" in section) {
      console.log(
        `  resources: baseline ${section.baselineCount}, current ${section.currentCount}, delta ${section.countDelta >= 0 ? "+" : ""}${section.countDelta}`,
      )
      if (section.heapDeltaBytes !== null) {
        console.log(
          `  usedJSHeapSize: baseline ${formatBytes(section.baselineHeapBytes)}, current ${formatBytes(section.currentHeapBytes)}, delta ${section.heapDeltaBytes >= 0 ? "+" : ""}${formatBytes(section.heapDeltaBytes)}`,
        )
      }
      if (section.addedResources.length > 0) {
        console.log(`  added: ${section.addedResources.join(", ")}`)
      }
      if (section.removedResources.length > 0) {
        console.log(`  removed: ${section.removedResources.join(", ")}`)
      }
    } else {
      if (section.addedResources.length > 0) {
        console.log(`  added: ${section.addedResources.join(", ")}`)
      }
      if (section.removedResources.length > 0) {
        console.log(`  removed: ${section.removedResources.join(", ")}`)
      }
      if (
        section.addedResources.length === 0 &&
        section.removedResources.length === 0
      ) {
        console.log("  no differences")
      }
    }

    console.log("")
  }
}

/**
 * Build baseline/current artifacts, run probes, and write a combined summary.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2))
  const baselineRef = await resolveBaseline(options)
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const outputDir = path.resolve(
    options.outputDir ?? path.join("lazy-loading-compare-results", timestamp),
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

  console.log("Running baseline probe...")
  const baselineResolvedReportDir = await runProbe({
    reportDir: baselineReportDir,
    cwd: baselineSrcDir,
  })

  if (!options.skipCurrentBuild) {
    console.log("Building current workspace...")
    await runCommand("pnpm", ["build"])
  }

  const resolvedCurrentBuildDir =
    await resolveBuiltExtensionDir(currentBuildDir)

  console.log("Running current probe...")
  const currentResolvedReportDir = await runProbe({
    extensionDir: resolvedCurrentBuildDir,
    reportDir: currentReportDir,
    cwd: repoRoot,
  })

  const baselinePopup = await readJson(
    path.join(baselineResolvedReportDir, "popup-lazy-loading-report.json"),
  )
  const baselineOptions = await readJson(
    path.join(baselineResolvedReportDir, "options-lazy-loading-report.json"),
  )
  const currentPopup = await readJson(
    path.join(currentResolvedReportDir, "popup-lazy-loading-report.json"),
  )
  const currentOptions = await readJson(
    path.join(currentResolvedReportDir, "options-lazy-loading-report.json"),
  )

  const summary = {
    generatedAt: new Date().toISOString(),
    baselineRef,
    outputDir,
    baseline: {
      popup: baselinePopup,
      options: baselineOptions,
    },
    current: {
      popup: currentPopup,
      options: currentOptions,
    },
    comparison: {
      popup: {
        initial: compareSnapshot(baselinePopup.initial, currentPopup.initial),
        bookmarksDeferred: compareDeferred(
          baselinePopup.bookmarksDelta,
          currentPopup.bookmarksDelta,
        ),
        apiCredentialProfilesDeferred: compareDeferred(
          baselinePopup.apiCredentialProfilesDelta,
          currentPopup.apiCredentialProfilesDelta,
        ),
      },
      options: {
        initial: compareSnapshot(
          baselineOptions.initial,
          currentOptions.initial,
        ),
        usageAnalyticsDeferred: compareDeferred(
          baselineOptions.usageAnalyticsDelta,
          currentOptions.usageAnalyticsDelta,
        ),
      },
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
