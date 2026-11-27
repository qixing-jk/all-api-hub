import { SUB2API_PANEL_PROOF_DATABASE_NAME } from "~/services/core/storageKeys"

const KEY_STORE = "keys"

/** Reads an existing key within the caller's open database connection. */
function readStoredSigningKey(
  database: IDBDatabase,
  origin: string,
): Promise<CryptoKeyPair | undefined> {
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(KEY_STORE)
      .objectStore(KEY_STORE)
      .get(origin)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** A persisted origin key also records that proof was previously required. */
export async function readSub2ApiPanelSigningKey(
  origin: string,
): Promise<CryptoKeyPair | undefined> {
  if (typeof indexedDB === "undefined") return undefined
  const database = await openSigningDatabase()
  try {
    return await readStoredSigningKey(database, origin)
  } finally {
    database.close()
  }
}

/** Extension-origin IndexedDB preserves non-exportable keys across worker restarts. */
async function openSigningDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SUB2API_PANEL_PROOF_DATABASE_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(KEY_STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error("Signing key storage blocked"))
  })
}

/** Native readwrite transactions arbitrate concurrent creators across extension contexts. */
export async function getSub2ApiPanelSigningKey(
  origin: string,
): Promise<CryptoKeyPair> {
  const database = await openSigningDatabase()
  try {
    const existing = await readStoredSigningKey(database, origin)
    if (existing) return existing
    const candidate = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"],
    )
    return await new Promise<CryptoKeyPair>((resolve, reject) => {
      const transaction = database.transaction(KEY_STORE, "readwrite")
      const store = transaction.objectStore(KEY_STORE)
      const request = store.get(origin)
      let selected = candidate
      request.onsuccess = () => {
        if (request.result) selected = request.result
        else store.put(candidate, origin)
      }
      transaction.oncomplete = () => resolve(selected)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () =>
        reject(
          transaction.error ?? new Error("Signing key transaction aborted"),
        )
    })
  } finally {
    database.close()
  }
}
