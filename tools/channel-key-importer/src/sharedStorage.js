import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

import { DATA_DIR } from "./dataPath.js"

const DEFAULT_DATABASE_PATH = join(DATA_DIR, "dataeyesai.sqlite")
const MASTER_KEY_PATH = join(DATA_DIR, "server-master.key")

let databasePromise = null
let masterKeyPromise = null

const cloneFallback = (value) =>
  value && typeof value === "object" ? structuredClone(value) : value

export function sqliteStorageEnabled() {
  return process.env.DATAEYESAI_STORAGE === "sqlite"
}

async function openDatabase() {
  if (databasePromise) return await databasePromise
  databasePromise = (async () => {
    const databasePath =
      process.env.DATAEYESAI_DATABASE_PATH || DEFAULT_DATABASE_PATH
    await mkdir(dirname(databasePath), { recursive: true, mode: 0o700 })
    const { DatabaseSync } = await import("node:sqlite")
    const database = new DatabaseSync(databasePath)
    database.exec("PRAGMA journal_mode = WAL")
    database.exec("PRAGMA synchronous = NORMAL")
    database.exec(`
      CREATE TABLE IF NOT EXISTS app_state (
        state_key TEXT PRIMARY KEY,
        state_value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS encrypted_secrets (
        secret_key TEXT PRIMARY KEY,
        secret_value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
    return database
  })()
  return await databasePromise
}

async function readLegacyJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"))
  } catch {
    return cloneFallback(fallback)
  }
}

async function writeLegacyJson(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  })
}

export function createJsonStateStore({ key, path }) {
  return {
    async read(fallback) {
      if (!sqliteStorageEnabled()) {
        return await readLegacyJson(path, fallback)
      }
      const database = await openDatabase()
      const row = database
        .prepare("SELECT state_value FROM app_state WHERE state_key = ?")
        .get(key)
      if (row?.state_value) {
        try {
          return JSON.parse(row.state_value)
        } catch {
          return cloneFallback(fallback)
        }
      }
      const legacyValue = await readLegacyJson(path, fallback)
      await this.write(legacyValue)
      return legacyValue
    },

    async write(value) {
      if (!sqliteStorageEnabled()) {
        await writeLegacyJson(path, value)
        return
      }
      const database = await openDatabase()
      database
        .prepare(
          `INSERT INTO app_state (state_key, state_value, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(state_key) DO UPDATE SET
             state_value = excluded.state_value,
             updated_at = excluded.updated_at`,
        )
        .run(key, JSON.stringify(value), new Date().toISOString())
    },
  }
}

async function loadMasterKey() {
  if (masterKeyPromise) return await masterKeyPromise
  masterKeyPromise = (async () => {
    const configured = String(process.env.DATAEYESAI_MASTER_KEY || "").trim()
    if (configured) {
      const key = Buffer.from(configured, "base64")
      if (key.length !== 32) {
        throw new Error("DATAEYESAI_MASTER_KEY 必须是 32 字节 Base64 密钥")
      }
      return key
    }
    try {
      const key = Buffer.from(
        (await readFile(MASTER_KEY_PATH, "utf8")).trim(),
        "base64",
      )
      if (key.length === 32) return key
    } catch {
      // The first server start creates a machine-local encryption key.
    }
    const key = randomBytes(32)
    await mkdir(dirname(MASTER_KEY_PATH), { recursive: true, mode: 0o700 })
    await writeFile(MASTER_KEY_PATH, key.toString("base64"), {
      encoding: "utf8",
      mode: 0o600,
    })
    return key
  })()
  return await masterKeyPromise
}

async function encryptSecret(value) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", await loadMasterKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(String(value), "utf8"),
    cipher.final(),
  ])
  return JSON.stringify({
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  })
}

async function decryptSecret(value) {
  const payload = JSON.parse(value)
  const decipher = createDecipheriv(
    "aes-256-gcm",
    await loadMasterKey(),
    Buffer.from(payload.iv, "base64"),
  )
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"))
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8")
}

async function saveEncryptedSecret(secretKey, value) {
  const database = await openDatabase()
  database
    .prepare(
      `INSERT INTO encrypted_secrets (secret_key, secret_value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(secret_key) DO UPDATE SET
         secret_value = excluded.secret_value,
         updated_at = excluded.updated_at`,
    )
    .run(secretKey, await encryptSecret(value), new Date().toISOString())
}

async function readEncryptedSecret(secretKey) {
  const database = await openDatabase()
  const row = database
    .prepare("SELECT secret_value FROM encrypted_secrets WHERE secret_key = ?")
    .get(secretKey)
  if (!row?.secret_value) return ""
  try {
    return await decryptSecret(row.secret_value)
  } catch {
    return ""
  }
}

async function deleteEncryptedSecret(secretKey) {
  const database = await openDatabase()
  database
    .prepare("DELETE FROM encrypted_secrets WHERE secret_key = ?")
    .run(secretKey)
}

export function createSharedTokenStore() {
  if (!sqliteStorageEnabled()) return null
  return {
    async save(account, token) {
      await saveEncryptedSecret(`new-api-token:${account}`, token)
    },

    async read(account) {
      return await readEncryptedSecret(`new-api-token:${account}`)
    },

    async delete(account) {
      await deleteEncryptedSecret(`new-api-token:${account}`)
    },

    async saveSession(account, session) {
      await saveEncryptedSecret(
        `new-api-session:${account}`,
        JSON.stringify(session),
      )
    },

    async readSession(account) {
      const value = await readEncryptedSecret(`new-api-session:${account}`)
      if (!value) return null
      try {
        return JSON.parse(value)
      } catch {
        return null
      }
    },

    async deleteSession(account) {
      await deleteEncryptedSecret(`new-api-session:${account}`)
    },
  }
}

export async function closeSharedStorageForTests() {
  if (!databasePromise) return
  const database = await databasePromise
  database.close()
  databasePromise = null
  masterKeyPromise = null
}
