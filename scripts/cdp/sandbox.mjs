/* global chrome */
import { randomUUID } from "node:crypto"

/**
 * Read one raw `chrome.storage.local` value from inside the service worker.
 */
async function readStoredValue(serviceWorker, storageKey) {
  return await serviceWorker.evaluate((key) => {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        resolve(result[key])
      })
    })
  }, storageKey)
}

/**
 * Write one raw `chrome.storage.local` value from inside the service worker.
 * Passing `undefined` removes the key, matching a never-written value.
 */
async function writeStoredValue(serviceWorker, storageKey, value) {
  await serviceWorker.evaluate(
    ({ key, nextValue }) => {
      return new Promise((resolve) => {
        if (nextValue === undefined) {
          chrome.storage.local.remove(key, () => resolve(true))
          return
        }
        chrome.storage.local.set({ [key]: nextValue }, () => resolve(true))
      })
    },
    { key: storageKey, nextValue: value },
  )
}

/**
 * Execute an async test function with a patched JSON storage value, restoring
 * the exact original bytes afterwards.
 *
 * The dev browser profile is shared with the operator's daily browsing and with
 * every other worktree, so a live run must not leave seeded preferences behind.
 * Live suites seed before opening the extension page, because the options app
 * reads preferences on load.
 */
export async function withStoredValue(
  serviceWorker,
  storageKey,
  patch,
  testFn,
) {
  const original = await readStoredValue(serviceWorker, storageKey)

  let current = {}
  if (typeof original === "string") {
    try {
      current = JSON.parse(original) || {}
    } catch {
      current = {}
    }
  } else if (original && typeof original === "object") {
    current = original
  }

  await writeStoredValue(
    serviceWorker,
    storageKey,
    JSON.stringify({ ...current, ...patch }),
  )

  try {
    return await testFn()
  } finally {
    await writeStoredValue(serviceWorker, storageKey, original)
  }
}

/** Read configured accounts without replacing unreadable storage. */
export async function getAccounts(serviceWorker) {
  return serviceWorker.evaluate(async () => {
    const result = await chrome.storage.local.get("site_accounts")
    const raw = result.site_accounts
    const envelope = typeof raw === "string" ? JSON.parse(raw) : raw
    if (envelope === undefined) return []
    if (!Array.isArray(envelope?.accounts))
      throw new Error("invalid_account_storage")
    return envelope.accounts
  })
}

/** Insert/remove only a unique fixture, using the application's account lock. */
async function mutateFixture(serviceWorker, fixture, remove) {
  await serviceWorker.evaluate(
    async ({ fixture, remove }) => {
      if (!navigator.locks) throw new Error("account_storage_lock_unavailable")
      // Same lock as STORAGE_LOCKS.ACCOUNT_STORAGE; CDP callbacks cannot import app modules.
      return navigator.locks.request(
        "all-api-hub:account-storage",
        { mode: "exclusive" },
        async () => {
          const result = await new Promise((resolve, reject) => {
            chrome.storage.local.get("site_accounts", (value) => {
              if (chrome.runtime.lastError)
                reject(new Error(chrome.runtime.lastError.message))
              else resolve(value)
            })
          })
          const raw = result.site_accounts
          const envelope =
            raw === undefined
              ? { accounts: [], pinnedAccountIds: [], last_updated: Date.now() }
              : typeof raw === "string"
                ? JSON.parse(raw)
                : raw
          if (!envelope || !Array.isArray(envelope.accounts))
            throw new Error("invalid_account_storage")
          if (
            !remove &&
            envelope.accounts.some((account) => account.id === fixture.id)
          )
            throw new Error("temporary_account_collision")
          const accounts = remove
            ? envelope.accounts.filter((account) => account.id !== fixture.id)
            : [fixture, ...envelope.accounts]
          const next = { ...envelope, accounts, last_updated: Date.now() }
          if (remove) {
            for (const field of ["pinnedAccountIds", "orderedAccountIds"]) {
              if (Array.isArray(next[field]))
                next[field] = next[field].filter((id) => id !== fixture.id)
            }
          }
          await new Promise((resolve, reject) => {
            chrome.storage.local.set(
              { site_accounts: JSON.stringify(next) },
              () => {
                if (chrome.runtime.lastError)
                  reject(new Error(chrome.runtime.lastError.message))
                else resolve()
              },
            )
          })
        },
      )
    },
    { fixture, remove },
  )
}

/** Preserve accounts and concurrent edits throughout a live test. */
export async function withTemporaryAccount(
  serviceWorker,
  accountFixture,
  testFn,
) {
  const fixtureId = randomUUID()
  const now = Date.now()
  const fixture = {
    health: { status: "unknown" },
    last_sync_time: 0,
    notes: "",
    tagIds: [],
    disabled: false,
    excludeFromTotalBalance: false,
    excludeFromTodayIncome: false,
    authType: "access_token",
    exchange_rate: 7.2,
    checkIn: {
      automaticExecutionEnabled: false,
      methodKnowledge: { methods: {} },
      selection: { mode: "automatic" },
    },
    ...accountFixture,
    id: `sandbox-${fixtureId}`,
    site_name: `${accountFixture.site_name || "Live test"} [${fixtureId.slice(0, 8)}]`,
    account_info: {
      id: "live-test-user",
      access_token: "",
      username: "live-test-user",
      quota: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
      ...accountFixture.account_info,
    },
    created_at: now,
    updated_at: now,
    user_updated_at: now,
  }
  await mutateFixture(serviceWorker, fixture, false)
  try {
    return await testFn(fixture)
  } finally {
    await mutateFixture(serviceWorker, fixture, true)
  }
}
