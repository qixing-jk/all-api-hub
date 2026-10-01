/* global chrome */

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

/**
 * Read all configured site accounts and the raw storage snapshot from chrome.storage.local.
 */
export async function getAccounts(serviceWorker) {
  return await serviceWorker.evaluate(() => {
    return new Promise((resolve) => {
      chrome.storage.local.get("site_accounts", (res) => {
        let accounts = []
        if (typeof res.site_accounts === "string") {
          try {
            accounts = JSON.parse(res.site_accounts)?.accounts || []
          } catch {
            accounts = []
          }
        } else if (res.site_accounts?.accounts) {
          accounts = res.site_accounts.accounts
        }
        resolve(accounts)
      })
    })
  })
}

/**
 * Execute an async test function with a temporary account fixture injected,
 * ensuring Plasmo-compatible string serialization and guaranteeing
 * that original storage is 100% restored in the finally block.
 */
export async function withTemporaryAccount(
  serviceWorker,
  accountFixture,
  testFn,
) {
  // 1. 获取当前存储快照及序列化形式
  const snapshotData = await serviceWorker.evaluate(() => {
    return new Promise((resolve) => {
      chrome.storage.local.get("site_accounts", (res) => {
        const raw = res.site_accounts
        let parsed = {}
        if (typeof raw === "string") {
          try {
            parsed = JSON.parse(raw) || {}
          } catch {
            parsed = {}
          }
        } else if (raw && typeof raw === "object") {
          parsed = raw
        }
        resolve({
          raw,
          envelope: parsed,
          accounts: parsed.accounts || [],
        })
      })
    })
  })

  const originalAccounts = snapshotData.accounts
  const existingIdx = originalAccounts.findIndex(
    (a) =>
      a.id === accountFixture.id ||
      (accountFixture.site_url && a.site_url === accountFixture.site_url),
  )

  const updatedAccounts = [...originalAccounts]
  if (existingIdx !== -1) {
    updatedAccounts[existingIdx] = {
      ...updatedAccounts[existingIdx],
      ...accountFixture,
    }
  } else {
    // 插入到首位以保证在 UI 顶部直接可见
    updatedAccounts.unshift(accountFixture)
  }

  const nextEnvelope = {
    ...snapshotData.envelope,
    accounts: updatedAccounts,
  }

  // Plasmo Storage 严格要求序列化为 JSON 字符串
  const nextStorageValue = JSON.stringify(nextEnvelope)

  // 2. 写入注入的数据
  await serviceWorker.evaluate((val) => {
    return new Promise((resolve) => {
      chrome.storage.local.set({ site_accounts: val }, () => {
        resolve(true)
      })
    })
  }, nextStorageValue)

  try {
    return await testFn(accountFixture)
  } finally {
    // 3. 强制现场绝对复原原始快照 (统一保证 Plasmo 兼容字符串)
    const restoreVal =
      snapshotData.raw === undefined
        ? undefined
        : typeof snapshotData.raw === "string"
          ? snapshotData.raw
          : JSON.stringify(snapshotData.envelope)

    await serviceWorker.evaluate((original) => {
      return new Promise((resolve) => {
        if (original === undefined) {
          chrome.storage.local.remove("site_accounts", () => resolve(true))
          return
        }
        chrome.storage.local.set({ site_accounts: original }, () => {
          resolve(true)
        })
      })
    }, restoreVal)
  }
}
