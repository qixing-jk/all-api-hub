import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

import { DATA_DIR } from "./dataPath.js"

const BALANCE_PATH = join(DATA_DIR, "balances.json")

export function calculateBalanceUsage(initialBalance, currentBalance) {
  if (!Number.isFinite(initialBalance) || !Number.isFinite(currentBalance)) {
    return { spentSinceImport: null, balanceIncreased: false }
  }
  if (currentBalance > initialBalance) {
    return { spentSinceImport: null, balanceIncreased: true }
  }
  return {
    spentSinceImport: Number((initialBalance - currentBalance).toFixed(8)),
    balanceIncreased: false,
  }
}

const entryKey = ({ targetUrl, userId, channelId }) =>
  `${targetUrl}#${userId}#${channelId}`

export class BalanceStore {
  async #readAll() {
    try {
      const parsed = JSON.parse(await readFile(BALANCE_PATH, "utf8"))
      return parsed && typeof parsed === "object" ? parsed : {}
    } catch {
      return {}
    }
  }

  async record(reference, currentBalance) {
    const entries = await this.#readAll()
    const key = entryKey(reference)
    const existing = entries[key]
    const initialBalance = Number.isFinite(existing?.initialBalance)
      ? existing.initialBalance
      : currentBalance
    const checkedAt = new Date().toISOString()

    entries[key] = {
      initialBalance,
      lastBalance: currentBalance,
      checkedAt,
    }
    await mkdir(dirname(BALANCE_PATH), { recursive: true, mode: 0o700 })
    await writeFile(BALANCE_PATH, `${JSON.stringify(entries, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    })

    return {
      currentBalance,
      initialBalance,
      checkedAt,
      ...calculateBalanceUsage(initialBalance, currentBalance),
    }
  }
}
