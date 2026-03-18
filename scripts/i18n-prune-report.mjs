import { execFileSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"

const repoRoot = process.cwd()
const localesRoot = path.join(repoRoot, "src", "locales")
const configPath = path.join(repoRoot, "i18next.config.ts")
const reportPathArgIndex = process.argv.indexOf("--report")
const reportPath =
  reportPathArgIndex >= 0 ? process.argv[reportPathArgIndex + 1] : undefined

/**
 * Execute pnpm subcommands in a cross-platform way.
 * @param args pnpm arguments excluding the executable itself.
 */
function runPnpm(args) {
  if (
    typeof process.env.npm_execpath === "string" &&
    process.env.npm_execpath
  ) {
    execFileSync(process.execPath, [process.env.npm_execpath, ...args], {
      stdio: "inherit",
    })
    return
  }

  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", `pnpm ${args.join(" ")}`], {
      stdio: "inherit",
    })
    return
  }

  execFileSync("pnpm", args, {
    stdio: "inherit",
  })
}

/**
 * Recursively list locale JSON files.
 * @param dir Locale directory root.
 * @returns Absolute JSON file paths.
 */
async function listLocaleFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await listLocaleFiles(fullPath)))
      continue
    }

    if (entry.name.endsWith(".json")) {
      files.push(fullPath)
    }
  }

  return files.sort()
}

/**
 * Flatten nested locale objects to dotted keys.
 * @param value JSON value to flatten.
 * @param prefix Current dotted prefix.
 * @param output Output map.
 * @returns Flattened key/value pairs.
 */
function flattenLocaleObject(value, prefix = "", output = new Map()) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      const nextKey = prefix ? `${prefix}.${key}` : key
      flattenLocaleObject(child, nextKey, output)
    }
    return output
  }

  if (prefix) {
    output.set(prefix, value)
  }

  return output
}

/**
 * Read current locale files into raw + flattened snapshots.
 * @returns Snapshot keyed by repo-relative locale file path.
 */
async function captureLocaleSnapshot() {
  const files = await listLocaleFiles(localesRoot)
  const snapshot = new Map()

  for (const absolutePath of files) {
    const raw = await fs.readFile(absolutePath, "utf8")
    const relativePath = path
      .relative(repoRoot, absolutePath)
      .replaceAll("\\", "/")
    const parsed = JSON.parse(raw)
    snapshot.set(relativePath, {
      raw,
      flat: flattenLocaleObject(parsed),
    })
  }

  return snapshot
}

/**
 * Restore locale files exactly as they were before probing.
 * @param snapshot Original locale snapshot.
 */
async function restoreLocaleSnapshot(snapshot) {
  const currentFiles = new Set(
    (await listLocaleFiles(localesRoot)).map((absolutePath) =>
      path.relative(repoRoot, absolutePath).replaceAll("\\", "/"),
    ),
  )

  for (const relativePath of currentFiles) {
    if (!snapshot.has(relativePath)) {
      await fs.unlink(path.join(repoRoot, relativePath))
    }
  }

  for (const [relativePath, data] of snapshot.entries()) {
    const absolutePath = path.join(repoRoot, relativePath)
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, data.raw, "utf8")
  }
}

/**
 * Normalize a value for semantic equality checks.
 * @param value Locale leaf value.
 * @returns Stable serialized representation.
 */
function serializeLocaleValue(value) {
  return JSON.stringify(value)
}

/**
 * Produce a semantic diff between two locale snapshots.
 * @param before Snapshot before extract.
 * @param after Snapshot after extract.
 * @returns Semantic file-by-file report.
 */
function diffSnapshots(before, after) {
  const allFiles = new Set([...before.keys(), ...after.keys()])
  const fileReports = []

  for (const file of [...allFiles].sort()) {
    const beforeFile = before.get(file)
    const afterFile = after.get(file)

    if (!beforeFile || !afterFile) {
      fileReports.push({
        file,
        created: !beforeFile,
        deleted: !afterFile,
        orderOnly: false,
        added: beforeFile ? [] : [...afterFile.flat.keys()].sort(),
        removed: afterFile ? [] : [...beforeFile.flat.keys()].sort(),
        changedValues: [],
      })
      continue
    }

    const beforeKeys = beforeFile.flat
    const afterKeys = afterFile.flat
    const allKeys = new Set([...beforeKeys.keys(), ...afterKeys.keys()])
    const added = []
    const removed = []
    const changedValues = []

    for (const key of [...allKeys].sort()) {
      const hadBefore = beforeKeys.has(key)
      const hasAfter = afterKeys.has(key)

      if (!hadBefore && hasAfter) {
        added.push(key)
        continue
      }

      if (hadBefore && !hasAfter) {
        removed.push(key)
        continue
      }

      const beforeValue = beforeKeys.get(key)
      const afterValue = afterKeys.get(key)
      if (
        serializeLocaleValue(beforeValue) !== serializeLocaleValue(afterValue)
      ) {
        changedValues.push({
          key,
          before: beforeValue,
          after: afterValue,
        })
      }
    }

    const semanticChanges = added.length + removed.length + changedValues.length

    if (semanticChanges > 0 || beforeFile.raw !== afterFile.raw) {
      fileReports.push({
        file,
        created: false,
        deleted: false,
        orderOnly: semanticChanges === 0 && beforeFile.raw !== afterFile.raw,
        added,
        removed,
        changedValues,
      })
    }
  }

  const summary = {
    filesTouched: fileReports.length,
    semanticFiles: fileReports.filter((file) => !file.orderOnly).length,
    orderOnlyFiles: fileReports.filter((file) => file.orderOnly).length,
    addedKeys: fileReports.reduce(
      (total, file) => total + file.added.length,
      0,
    ),
    removedKeys: fileReports.reduce(
      (total, file) => total + file.removed.length,
      0,
    ),
    changedValues: fileReports.reduce(
      (total, file) => total + file.changedValues.length,
      0,
    ),
  }

  return { summary, files: fileReports }
}

/**
 * Format a concise human-readable report.
 * @param report Semantic diff report.
 * @returns Markdown-ish summary.
 */
function formatHumanReport(report) {
  const lines = [
    "i18n prune report",
    "",
    `files touched: ${report.summary.filesTouched}`,
    `files with semantic changes: ${report.summary.semanticFiles}`,
    `files with order-only changes: ${report.summary.orderOnlyFiles}`,
    `added keys: ${report.summary.addedKeys}`,
    `removed keys: ${report.summary.removedKeys}`,
    `changed values: ${report.summary.changedValues}`,
    "",
  ]

  const filesWithSemanticChanges = report.files.filter(
    (file) => !file.orderOnly,
  )
  for (const file of filesWithSemanticChanges) {
    lines.push(file.file)
    if (file.created) lines.push("  created file")
    if (file.deleted) lines.push("  deleted file")
    if (file.added.length) {
      lines.push(`  added (${file.added.length}): ${file.added.join(", ")}`)
    }
    if (file.removed.length) {
      lines.push(
        `  removed (${file.removed.length}): ${file.removed.join(", ")}`,
      )
    }
    if (file.changedValues.length) {
      lines.push(
        `  changed (${file.changedValues.length}): ${file.changedValues
          .map((entry) => entry.key)
          .join(", ")}`,
      )
    }
    lines.push("")
  }

  if (report.summary.orderOnlyFiles > 0) {
    lines.push("order-only files")
    for (const file of report.files.filter((entry) => entry.orderOnly)) {
      lines.push(`  - ${file.file}`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

const tempConfigPath = path.join(
  repoRoot,
  `.tmp-i18next-prune-${process.pid}.config.ts`,
)

const beforeSnapshot = await captureLocaleSnapshot()

try {
  const configSource = await fs.readFile(configPath, "utf8")
  const nextConfigSource = configSource.replace(
    /removeUnusedKeys:\s*false/,
    "removeUnusedKeys: true",
  )

  if (nextConfigSource === configSource) {
    throw new Error(
      "Could not enable removeUnusedKeys in temporary i18next config.",
    )
  }

  await fs.writeFile(tempConfigPath, nextConfigSource, "utf8")

  runPnpm(["exec", "i18next-cli", "extract", "--config", tempConfigPath])

  const afterSnapshot = await captureLocaleSnapshot()
  const report = diffSnapshots(beforeSnapshot, afterSnapshot)
  const humanReport = formatHumanReport(report)

  console.log(humanReport)

  if (reportPath) {
    const absoluteReportPath = path.isAbsolute(reportPath)
      ? reportPath
      : path.join(repoRoot, reportPath)
    await fs.mkdir(path.dirname(absoluteReportPath), { recursive: true })
    await fs.writeFile(
      absoluteReportPath,
      JSON.stringify(report, null, 2) + "\n",
      "utf8",
    )
    console.log(`saved report: ${absoluteReportPath}`)
  }
} finally {
  await restoreLocaleSnapshot(beforeSnapshot)
  await fs.rm(tempConfigPath, { force: true })
}
