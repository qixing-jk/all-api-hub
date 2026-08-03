import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import {
  closeSharedStorageForTests,
  createJsonStateStore,
  createSharedTokenStore,
} from "../src/sharedStorage.js"

test("shares JSON state and encrypted tokens through SQLite", async () => {
  const root = await mkdtemp(join(tmpdir(), "dataeyesai-sqlite-"))
  const previous = {
    databasePath: process.env.DATAEYESAI_DATABASE_PATH,
    masterKey: process.env.DATAEYESAI_MASTER_KEY,
    storage: process.env.DATAEYESAI_STORAGE,
  }
  process.env.DATAEYESAI_STORAGE = "sqlite"
  process.env.DATAEYESAI_DATABASE_PATH = join(root, "shared.sqlite")
  process.env.DATAEYESAI_MASTER_KEY = Buffer.alloc(32, 9).toString("base64")
  try {
    const first = createJsonStateStore({
      key: "example",
      path: join(root, "legacy.json"),
    })
    await first.write({ records: [1, 2, 3] })
    const second = createJsonStateStore({
      key: "example",
      path: join(root, "unused.json"),
    })
    assert.deepEqual(await second.read({}), { records: [1, 2, 3] })

    const tokens = createSharedTokenStore()
    await tokens.save("site#1", "new-api-admin-token-secret")
    assert.equal(await tokens.read("site#1"), "new-api-admin-token-secret")
    await tokens.saveSession("site#2", {
      username: "admin",
      sessionCookie: "session-cookie-secret",
    })
    assert.deepEqual(await tokens.readSession("site#2"), {
      username: "admin",
      sessionCookie: "session-cookie-secret",
    })
    await closeSharedStorageForTests()
    const databaseBytes = await readFile(join(root, "shared.sqlite"))
    assert.equal(
      databaseBytes.includes(Buffer.from("new-api-admin-token-secret")),
      false,
    )
    assert.equal(
      databaseBytes.includes(Buffer.from("session-cookie-secret")),
      false,
    )
  } finally {
    await closeSharedStorageForTests()
    if (previous.storage === undefined) delete process.env.DATAEYESAI_STORAGE
    else process.env.DATAEYESAI_STORAGE = previous.storage
    if (previous.databasePath === undefined) {
      delete process.env.DATAEYESAI_DATABASE_PATH
    } else {
      process.env.DATAEYESAI_DATABASE_PATH = previous.databasePath
    }
    if (previous.masterKey === undefined) {
      delete process.env.DATAEYESAI_MASTER_KEY
    } else {
      process.env.DATAEYESAI_MASTER_KEY = previous.masterKey
    }
    await rm(root, { force: true, recursive: true })
  }
})
