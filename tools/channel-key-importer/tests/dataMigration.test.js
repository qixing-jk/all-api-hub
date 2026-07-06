import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { migrateDataFiles } from "../src/dataMigration.js"

test("migrates legacy data without overwriting desktop data", async () => {
  const root = await mkdtemp(join(tmpdir(), "dataeyesai-migration-"))
  const source = join(root, "source")
  const target = join(root, "target")
  try {
    await migrateDataFiles(source, target)
    await mkdir(source, { recursive: true })
    await writeFile(join(source, "config.json"), "legacy")
    await writeFile(join(source, "imports.json"), "imports")
    assert.deepEqual(await migrateDataFiles(source, target), [
      "config.json",
      "imports.json",
    ])
    await writeFile(join(source, "config.json"), "changed")
    assert.deepEqual(await migrateDataFiles(source, target), [])
    assert.equal(await readFile(join(target, "config.json"), "utf8"), "legacy")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
