import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { replaceProfileDatabase } from "~~/scripts/cdp/profile-database-copy.mjs"

const roots: string[] = []
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => fs.rmSync(root, { recursive: true, force: true })),
)

function fixture() {
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "aah-copy-test-"),
  )
  roots.push(root)
  const source = path.join(root, "source")
  const target = path.join(root, "target")
  fs.mkdirSync(source)
  fs.mkdirSync(target)
  fs.writeFileSync(path.join(source, "CURRENT"), "MANIFEST-1")
  fs.writeFileSync(path.join(source, "MANIFEST-1"), "new-data")
  fs.writeFileSync(path.join(source, "LOCK"), "")
  fs.writeFileSync(path.join(target, "old.ldb"), "old-data")
  return { root, source, target }
}

describe("profile database replacement", () => {
  it("replaces a complete snapshot and retains a backup instead of mixing files", () => {
    const { source, target } = fixture()
    const backup = replaceProfileDatabase(source, target)
    expect(fs.readdirSync(target).sort()).toEqual(["CURRENT", "MANIFEST-1"])
    expect(fs.readFileSync(path.join(backup!, "old.ldb"), "utf8")).toBe(
      "old-data",
    )
  })
  it("leaves the original untouched when copying fails", () => {
    const { source, target } = fixture()
    expect(() =>
      replaceProfileDatabase(source, target, () => {
        throw new Error("locked")
      }),
    ).toThrow("locked")
    expect(fs.readdirSync(target)).toEqual(["old.ldb"])
  })
  it("rejects a source modified while it is being copied", () => {
    const { source, target } = fixture()
    expect(() =>
      replaceProfileDatabase(source, target, (from: string, to: string) => {
        fs.cpSync(from, to, { recursive: true })
        fs.writeFileSync(path.join(from, "MANIFEST-1"), "changed")
      }),
    ).toThrow("source_database_changed")
    expect(fs.readdirSync(target)).toEqual(["old.ldb"])
  })
  it("rejects overlapping source and target directories", () => {
    const { source } = fixture()
    expect(() =>
      replaceProfileDatabase(source, path.join(source, "nested")),
    ).toThrow("overlapping_database_paths")
  })
})
