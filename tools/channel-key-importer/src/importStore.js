import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

import { DATA_DIR } from "./dataPath.js"

const IMPORTS_PATH = join(DATA_DIR, "imports.json")
const MAX_RECORDS = 2000

export function keyIdentity(apiKey) {
  const normalized = String(apiKey)
  const suffix = normalized.slice(-4)
  return {
    keyHint: suffix ? `••••${suffix}` : "••••",
    keyFingerprint: createHash("sha256")
      .update(normalized)
      .digest("hex")
      .slice(0, 12),
  }
}

export function calculateQuotaUsage(
  quota,
  currentBalance,
  sharedChannel = false,
) {
  if (!Number.isFinite(quota)) {
    return { spent: null, usageStatus: "quota-missing" }
  }
  if (sharedChannel) {
    return { spent: null, usageStatus: "shared-channel" }
  }
  if (!Number.isFinite(currentBalance)) {
    return { spent: 0, usageStatus: "awaiting-balance" }
  }
  if (currentBalance > quota) {
    return { spent: null, usageStatus: "balance-increased" }
  }
  return {
    spent: Number((quota - currentBalance).toFixed(8)),
    usageStatus: "available",
  }
}

export function applyGatewayUsage(record, usage, binding = {}) {
  const checkedAt = new Date().toISOString()
  return {
    ...record,
    ...binding,
    gatewaySpent: usage.spentUsd,
    spent: usage.spentUsd,
    requestCount: usage.requestCount,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    lastUsedAt: usage.lastUsedAt,
    usageLogCount: usage.scannedLogCount,
    usageTotalLogCount: usage.totalLogCount,
    usageTruncated: usage.truncated === true,
    usageDetailsComplete: usage.usageDetailsComplete === true,
    usageMethod: usage.usageMethod,
    quotaPerUnit: usage.quotaPerUnit,
    usageStatus: "gateway-usage",
    usageCheckedAt: checkedAt,
    checkedAt,
  }
}

export function applyBalanceUsage(record, currentBalance) {
  const balanceUsage = calculateQuotaUsage(
    record.quota,
    currentBalance,
    record.sharedChannel,
  )
  const updated = {
    ...record,
    currentBalance,
    upstreamSpent: balanceUsage.spent,
    balanceStatus: balanceUsage.usageStatus,
    checkedAt: new Date().toISOString(),
  }
  return Number.isFinite(record.gatewaySpent)
    ? updated
    : { ...updated, ...balanceUsage }
}

export class ImportStore {
  #mutation = Promise.resolve()

  async #readAll() {
    try {
      const value = JSON.parse(await readFile(IMPORTS_PATH, "utf8"))
      return Array.isArray(value) ? value : []
    } catch {
      return []
    }
  }

  async #writeAll(records) {
    await mkdir(dirname(IMPORTS_PATH), { recursive: true, mode: 0o700 })
    await writeFile(
      IMPORTS_PATH,
      `${JSON.stringify(records.slice(0, MAX_RECORDS), null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    )
  }

  async list() {
    return await this.#readAll()
  }

  async #mutate(operation) {
    const result = this.#mutation.then(operation, operation)
    this.#mutation = result.catch(() => {})
    return await result
  }

  async record(input) {
    return await this.#mutate(async () => {
      const quota = Number.isFinite(input.quota) ? input.quota : null
      const currentBalance = Number.isFinite(input.currentBalance)
        ? input.currentBalance
        : null
      const usage = calculateQuotaUsage(
        quota,
        currentBalance,
        input.sharedChannel === true,
      )
      const record = {
        id: randomUUID(),
        profileId: input.profileId,
        targetName: input.targetName,
        targetUrl: input.targetUrl,
        providerName: input.providerName,
        ...keyIdentity(input.apiKey),
        quota,
        currentBalance,
        upstreamSpent: usage.spent,
        balanceStatus: usage.usageStatus,
        ...usage,
        sharedChannel: input.sharedChannel === true,
        keyIndex: Number.isInteger(input.keyIndex) ? input.keyIndex : null,
        gatewaySpent: null,
        requestCount: 0,
        promptTokens: 0,
        completionTokens: 0,
        lastUsedAt: null,
        operation: input.operation,
        channelId: input.channelId || null,
        channelName: input.channelName,
        importedAt: new Date().toISOString(),
        checkedAt: currentBalance == null ? null : new Date().toISOString(),
      }
      await this.#writeAll([record, ...(await this.#readAll())])
      return record
    })
  }

  async updateBalance(id, currentBalance) {
    return await this.#mutate(async () => {
      const records = await this.#readAll()
      const record = records.find((item) => item.id === id)
      if (!record) throw new Error("导入记录不存在")
      Object.assign(record, applyBalanceUsage(record, currentBalance))
      await this.#writeAll(records)
      return record
    })
  }

  async updateUsage(id, usage, binding = {}) {
    return await this.#mutate(async () => {
      const records = await this.#readAll()
      const record = records.find((item) => item.id === id)
      if (!record) throw new Error("导入记录不存在")
      Object.assign(record, applyGatewayUsage(record, usage, binding))
      await this.#writeAll(records)
      return record
    })
  }
}
