import { join } from "node:path"

import { DATA_DIR } from "./dataPath.js"
import { createJsonStateStore } from "./sharedStorage.js"

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
  constructor({ stateStore } = {}) {
    this.stateStore =
      stateStore ||
      createJsonStateStore({ key: "balances", path: BALANCE_PATH })
  }

  async #readAll() {
    const parsed = await this.stateStore.read({})
    return parsed && typeof parsed === "object" ? parsed : {}
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
    await this.stateStore.write(entries)

    return {
      currentBalance,
      initialBalance,
      checkedAt,
      ...calculateBalanceUsage(initialBalance, currentBalance),
    }
  }
}
