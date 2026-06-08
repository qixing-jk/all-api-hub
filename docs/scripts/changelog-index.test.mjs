import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  buildChangelogIndex,
  checkChangelogIndex,
  extractChangelogVersions,
  normalizeVersion,
  writeChangelogIndex,
} from "./changelog-index.mjs"

const scriptPath = fileURLToPath(import.meta.url).replace(
  /changelog-index\.test\.mjs$/,
  "changelog-index.mjs",
)
const docsPackagePath = fileURLToPath(import.meta.url).replace(
  /scripts[\\/]changelog-index\.test\.mjs$/,
  "package.json",
)

function createTempChangelogFixture(t, markdown = "## 3.44.0\n") {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "changelog-index-"))
  t.after(() => {
    fs.rmSync(tempDir, { force: true, recursive: true })
  })

  const changelogPath = path.join(tempDir, "docs", "changelog.md")
  const outputPath = path.join(
    tempDir,
    "docs",
    ".vuepress",
    "public",
    "data",
    "changelog-index.json",
  )

  fs.mkdirSync(path.dirname(changelogPath), { recursive: true })
  fs.writeFileSync(changelogPath, markdown)

  return { changelogPath, outputPath, tempDir }
}

function createTempCliFixture(t, markdown = "## 3.44.0\n") {
  const fixture = createTempChangelogFixture(t, markdown)
  const tempScriptPath = path.join(
    fixture.tempDir,
    "scripts",
    "changelog-index.mjs",
  )

  fs.mkdirSync(path.dirname(tempScriptPath), { recursive: true })
  fs.copyFileSync(scriptPath, tempScriptPath)

  return { ...fixture, scriptPath: tempScriptPath }
}

test("normalizeVersion accepts dotted versions with optional v prefix", () => {
  assert.equal(normalizeVersion(" 3.44.0 "), "3.44.0")
  assert.equal(normalizeVersion("v3.44.0"), "3.44.0")
  assert.equal(normalizeVersion("V3.44.1"), "3.44.1")
})

test("normalizeVersion rejects unsupported version labels", () => {
  assert.equal(normalizeVersion("nightly"), null)
  assert.equal(normalizeVersion("3.44.0-beta.1"), null)
  assert.equal(normalizeVersion("3.x"), null)
  assert.equal(normalizeVersion(""), null)
})

test("extractChangelogVersions reads second-level version headings only", () => {
  const markdown = [
    "# 更新日志",
    "",
    "## 3.44.0",
    "",
    "### 3.44.0",
    "",
    "```",
    "## 3.42.0",
    "```",
    "",
    "~~~",
    "## 3.41.0",
    "~~~",
    "",
    "## v3.43.0 - 2026-06-01",
  ].join("\n")

  assert.deepEqual(extractChangelogVersions(markdown), ["3.44.0", "3.43.0"])
})

test("buildChangelogIndex returns schema version and unique versions", () => {
  const markdown = [
    "## 3.44.0",
    "",
    "## v3.44.0",
    "",
    "## 3.43.0",
  ].join("\n")

  assert.deepEqual(buildChangelogIndex(markdown), {
    schemaVersion: 1,
    versions: ["3.44.0", "3.43.0"],
  })
})

test("writeChangelogIndex writes stable formatted JSON", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "changelog-index-"))
  const outputPath = path.join(tempDir, "data", "changelog-index.json")

  const { json } = writeChangelogIndex({
    markdown: ["## 3.44.0", "## 3.43.0"].join("\n"),
    outputPath,
  })

  const expected = `{
  "schemaVersion": 1,
  "versions": [
    "3.44.0",
    "3.43.0"
  ]
}
`

  assert.equal(json, expected)
  assert.equal(fs.readFileSync(outputPath, "utf8"), expected)
})

test("checkChangelogIndex returns false when the index file is missing", (t) => {
  const { changelogPath, outputPath } = createTempChangelogFixture(t)

  assert.equal(checkChangelogIndex({ changelogPath, outputPath }), false)
})

test("checkChangelogIndex returns false when the index file is stale", (t) => {
  const { changelogPath, outputPath } = createTempChangelogFixture(t)

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(
    outputPath,
    JSON.stringify({ schemaVersion: 1, versions: ["3.43.0"] }, null, 2),
  )

  assert.equal(checkChangelogIndex({ changelogPath, outputPath }), false)
})

test("CLI --check exits non-zero when the generated index is missing", (t) => {
  const { scriptPath: tempScriptPath } = createTempCliFixture(t)

  const result = spawnSync(process.execPath, [tempScriptPath, "--check"], {
    encoding: "utf8",
  })

  assert.equal(result.status, 1)
  assert.match(result.stderr, /changelog-index\.json is out of date/)
})

test("CLI --check exits zero when the generated index is current", (t) => {
  const {
    changelogPath,
    outputPath,
    scriptPath: tempScriptPath,
  } = createTempCliFixture(t)
  writeChangelogIndex({ changelogPath, outputPath })

  const result = spawnSync(process.execPath, [tempScriptPath, "--check"], {
    encoding: "utf8",
  })

  assert.equal(result.status, 0)
  assert.match(result.stdout, /changelog-index\.json is up to date/)
})

test("docs:check does not require committed changelog index freshness", () => {
  const packageJson = JSON.parse(fs.readFileSync(docsPackagePath, "utf8"))

  assert.doesNotMatch(
    packageJson.scripts["docs:check"],
    /docs:check-changelog-index/,
  )
  assert.match(
    packageJson.scripts["docs:build"],
    /docs:generate-changelog-index/,
  )
})
