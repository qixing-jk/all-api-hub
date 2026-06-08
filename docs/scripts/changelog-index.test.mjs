import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import {
  buildChangelogIndex,
  extractChangelogVersions,
  normalizeVersion,
  writeChangelogIndex,
} from "./changelog-index.mjs"

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
