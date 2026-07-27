import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const CHANGELOG_INDEX_SCHEMA_VERSION = 1

const scriptPath = fileURLToPath(import.meta.url)
const docsPackageRoot = path.resolve(path.dirname(scriptPath), "..")
const defaultChangelogPath = path.join(docsPackageRoot, "docs", "changelog.md")
const defaultOutputPath = path.join(
  docsPackageRoot,
  "docs",
  ".vuepress",
  "public",
  "data",
  "changelog-index.json",
)

function formatChangelogIndex(index) {
  return `${JSON.stringify(index, null, 2)}\n`
}

export function normalizeVersion(value) {
  const normalized = value.trim().replace(/^[vV]/, "")

  if (!/^\d+(?:\.\d+)*$/.test(normalized)) {
    return null
  }

  return normalized
}

export function extractChangelogVersions(markdown) {
  const versions = []
  const seen = new Set()
  let inFence = false

  for (const line of markdown.split(/\r?\n/)) {
    const trimmedLine = line.trimStart()
    if (trimmedLine.startsWith("```") || trimmedLine.startsWith("~~~")) {
      inFence = !inFence
      continue
    }

    if (inFence || !line.startsWith("## ") || line.startsWith("### ")) {
      continue
    }

    const firstToken = line.slice(3).trim().split(/\s+/)[0]
    const version = normalizeVersion(firstToken)

    if (version && !seen.has(version)) {
      seen.add(version)
      versions.push(version)
    }
  }

  return versions
}

export function buildChangelogIndex(markdown) {
  return {
    schemaVersion: CHANGELOG_INDEX_SCHEMA_VERSION,
    versions: extractChangelogVersions(markdown),
  }
}

export function writeChangelogIndex({
  changelogPath = defaultChangelogPath,
  outputPath = defaultOutputPath,
  markdown,
} = {}) {
  const sourceMarkdown =
    markdown ?? fs.readFileSync(changelogPath, { encoding: "utf8" })
  const index = buildChangelogIndex(sourceMarkdown)
  const json = formatChangelogIndex(index)

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, json)

  return { index, json, outputPath }
}

export function checkChangelogIndex({
  changelogPath = defaultChangelogPath,
  outputPath = defaultOutputPath,
} = {}) {
  const markdown = fs.readFileSync(changelogPath, { encoding: "utf8" })
  const expected = formatChangelogIndex(buildChangelogIndex(markdown))

  if (!fs.existsSync(outputPath)) {
    return false
  }

  return fs.readFileSync(outputPath, { encoding: "utf8" }) === expected
}

function formatCliOutputPath(outputPath) {
  return path.relative(docsPackageRoot, outputPath).replaceAll(path.sep, "/")
}

function runCli() {
  const isCheck = process.argv.includes("--check")

  if (isCheck) {
    if (!checkChangelogIndex()) {
      console.error(
        "changelog-index.json is out of date. Run `pnpm run docs:generate-changelog-index` in docs/.",
      )
      process.exitCode = 1
      return
    }

    console.log("changelog-index.json is up to date.")
    return
  }

  const { outputPath } = writeChangelogIndex()
  console.log(`Wrote ${formatCliOutputPath(outputPath)}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  runCli()
}
