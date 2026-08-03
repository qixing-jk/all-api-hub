import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

import { DATA_DIR } from "./dataPath.js"
import { keyIdentity } from "./importStore.js"
import { createJsonStateStore } from "./sharedStorage.js"

const SCHEDULES_PATH = join(DATA_DIR, "schedules.json")
const SECRET_PATH = join(DATA_DIR, "schedule-secret.key")
const MAX_JOBS = 100
const MIN_BATCH_SIZE = 1
const MAX_BATCH_SIZE = 200
const MAX_INTERVAL_MINUTES = 30 * 24 * 60
const STALE_RUNNING_MS = 30 * 60 * 1000
const DEFAULT_RATE_LIMIT_RETRY_MS = 3 * 60 * 1000

const clampInteger = (value, fallback, min, max) => {
  const integer = Number.parseInt(String(value ?? ""), 10)
  if (!Number.isInteger(integer)) return fallback
  return Math.min(max, Math.max(min, integer))
}

const isRateLimitFailure = (failure) =>
  failure?.retryable === true ||
  /(?:\b429\b|请求次数过多|too many requests|rate[ -]?limit)/i.test(
    String(failure?.error || failure || ""),
  )

const publicEntry = (entry) => ({
  id: entry.id,
  status: entry.status,
  keyHint: entry.keyHint,
  keyFingerprint: entry.keyFingerprint,
  quota: Number.isFinite(entry.quota) ? entry.quota : null,
  error: entry.error || "",
  channelId: entry.channelId || null,
  channelName: entry.channelName || "",
  importedAt: entry.importedAt || null,
  retryCount: Number.isInteger(entry.retryCount) ? entry.retryCount : 0,
  retryNotBefore: entry.retryNotBefore || null,
})

const jobCounts = (job) => {
  const entries = Array.isArray(job.entries) ? job.entries : []
  return {
    total: entries.length,
    pending: entries.filter((entry) => entry.status === "pending").length,
    imported: entries.filter((entry) => entry.status === "imported").length,
    failed: entries.filter((entry) => entry.status === "failed").length,
    uncertain: entries.filter((entry) => entry.status === "uncertain").length,
  }
}

const publicJob = (job) => ({
  id: job.id,
  name: job.name,
  providerName: job.providerName,
  targetName: job.targetName,
  targetUrl: job.targetUrl,
  kind: job.kind || "scheduled",
  status: job.status,
  batchSize: job.batchSize,
  intervalMinutes: job.intervalMinutes,
  priority: Number.isInteger(job.preview?.priority) ? job.preview.priority : 0,
  prioritySequence: job.preview?.prioritySequence || {
    enabled: false,
    step: 1,
  },
  weight: Number.isInteger(job.preview?.weight) ? job.preview.weight : 0,
  nextRunAt: job.nextRunAt,
  lastRunAt: job.lastRunAt || null,
  lastError: job.lastError || "",
  lastResult: job.lastResult || null,
  createdAt: job.createdAt,
  counts: jobCounts(job),
  entries: (job.entries || []).map(publicEntry),
})

export function normalizeScheduleOptions(input = {}) {
  const startAt = new Date(String(input.startAt || ""))
  if (Number.isNaN(startAt.getTime())) {
    throw new Error("请选择定时开始时间")
  }
  const batchSize = clampInteger(
    input.batchSize,
    1,
    MIN_BATCH_SIZE,
    MAX_BATCH_SIZE,
  )
  const intervalMinutes = clampInteger(
    input.intervalMinutes,
    60,
    0,
    MAX_INTERVAL_MINUTES,
  )
  return {
    batchSize,
    intervalMinutes,
    nextRunAt: startAt.toISOString(),
  }
}

export class ScheduleStore {
  #mutation = Promise.resolve()
  #secretPromise = null

  constructor({
    path = SCHEDULES_PATH,
    secretPath = SECRET_PATH,
    now = () => new Date(),
    stateStore = null,
  } = {}) {
    this.path = path
    this.secretPath = secretPath
    this.now = now
    this.stateStore =
      stateStore ||
      createJsonStateStore({
        key: path === SCHEDULES_PATH ? "schedules" : `schedules:${path}`,
        path,
      })
  }

  async #secret() {
    if (this.#secretPromise) return await this.#secretPromise
    this.#secretPromise = this.#loadSecret()
    return await this.#secretPromise
  }

  async #loadSecret() {
    try {
      const value = (await readFile(this.secretPath, "utf8")).trim()
      const secret = Buffer.from(value, "base64")
      if (secret.length === 32) return secret
    } catch {
      // A new local install gets a new file key. Existing scheduled jobs remain
      // tied to this machine and data directory.
    }
    const secret = randomBytes(32)
    await mkdir(dirname(this.secretPath), { recursive: true, mode: 0o700 })
    await writeFile(this.secretPath, secret.toString("base64"), {
      encoding: "utf8",
      mode: 0o600,
    })
    return secret
  }

  async #encrypt(value) {
    const iv = randomBytes(12)
    const cipher = createCipheriv("aes-256-gcm", await this.#secret(), iv)
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ])
    return {
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    }
  }

  async #decrypt(payload) {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      await this.#secret(),
      Buffer.from(payload.iv, "base64"),
    )
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64")),
      decipher.final(),
    ])
    return JSON.parse(plaintext.toString("utf8"))
  }

  async #readAll() {
    const value = await this.stateStore.read([])
    return Array.isArray(value) ? value : []
  }

  async #writeAll(jobs) {
    await this.stateStore.write(jobs.slice(0, MAX_JOBS))
  }

  async #mutate(operation) {
    const result = this.#mutation.then(operation, operation)
    this.#mutation = result.catch(() => {})
    return await result
  }

  async list() {
    return (await this.#readAll()).map(publicJob)
  }

  async nextRunAt() {
    const timestamps = (await this.#readAll())
      .filter(
        (job) =>
          job.status === "active" &&
          (job.entries || []).some((entry) => entry.status === "pending"),
      )
      .map((job) => new Date(job.nextRunAt).getTime())
      .filter(Number.isFinite)
    return timestamps.length > 0
      ? new Date(Math.min(...timestamps)).toISOString()
      : null
  }

  async findQueuedFingerprints({ profileId, apiKeys }) {
    const requested = new Set(
      (apiKeys || []).map((apiKey) => keyIdentity(apiKey).keyFingerprint),
    )
    if (!profileId || requested.size === 0) return new Set()
    const fingerprints = []
    for (const job of await this.#readAll()) {
      if (
        !["active", "paused"].includes(job.status) ||
        job.preview?.profileId !== profileId
      ) {
        continue
      }
      for (const entry of job.entries || []) {
        if (
          ["pending", "running", "uncertain", "failed"].includes(
            entry.status,
          ) &&
          requested.has(entry.keyFingerprint)
        ) {
          fingerprints.push(entry.keyFingerprint)
        }
      }
    }
    return new Set(fingerprints)
  }

  async create({
    preview,
    createOptions,
    schedule,
    kind = "scheduled",
    requestId = "",
  }) {
    return await this.#mutate(async () => {
      const jobs = await this.#readAll()
      const existing = requestId
        ? jobs.find((job) => job.requestId === requestId)
        : null
      if (existing) return publicJob(existing)
      const occupiedFingerprints = new Set(
        jobs
          .filter(
            (job) =>
              ["active", "paused"].includes(job.status) &&
              job.preview?.profileId === preview.profileId,
          )
          .flatMap((job) => job.entries || [])
          .filter((entry) =>
            ["pending", "running", "uncertain", "failed"].includes(
              entry.status,
            ),
          )
          .map((entry) => entry.keyFingerprint),
      )
      preview = {
        ...preview,
        keys: preview.keys.filter(
          (entry) =>
            !entry.apiKey ||
            !occupiedFingerprints.has(keyIdentity(entry.apiKey).keyFingerprint),
        ),
      }
      const options = normalizeScheduleOptions(schedule)
      const entries = await Promise.all(
        preview.keys.map(async (entry, priorityIndex) => ({
          id: randomUUID(),
          status: "pending",
          priorityIndex: Number.isInteger(entry.priorityIndex)
            ? entry.priorityIndex
            : priorityIndex,
          quota: Number.isFinite(entry.quota) ? entry.quota : null,
          ...keyIdentity(entry.apiKey),
          encryptedKey: await this.#encrypt(entry.apiKey),
        })),
      )
      if (entries.length === 0) throw new Error("没有可定时写入的 Key")
      const { keys, ...storedPreview } = preview
      const suffix =
        kind === "recovery"
          ? "自动续传"
          : kind === "paced"
            ? "安全节流队列"
            : "定时上 Key"
      const job = {
        id: randomUUID(),
        requestId: String(requestId || ""),
        kind,
        name: `${preview.name} · ${suffix}`.slice(0, 100),
        providerName: preview.provider.name,
        targetName: preview.targetName,
        targetUrl: preview.targetUrl,
        status: "active",
        batchSize: options.batchSize,
        intervalMinutes: options.intervalMinutes,
        nextRunAt: options.nextRunAt,
        lastRunAt: null,
        lastError: "",
        lastResult: null,
        createdAt: this.now().toISOString(),
        preview: storedPreview,
        createOptions,
        entries,
      }
      await this.#writeAll([job, ...jobs])
      return publicJob(job)
    })
  }

  async claimDueJob(now = this.now()) {
    return await this.#claim((job) => {
      const nowTime = now.getTime()
      return (
        job.status === "active" &&
        new Date(job.nextRunAt).getTime() <= nowTime &&
        (job.entries || []).some((entry) => entry.status === "pending")
      )
    }, now)
  }

  async claimJobNow(jobId, now = this.now()) {
    return await this.#claim(
      (job) =>
        job.id === jobId &&
        ["active", "paused"].includes(job.status) &&
        (job.entries || []).some((entry) => entry.status === "pending"),
      now,
    )
  }

  async #claim(predicate, now) {
    return await this.#mutate(async () => {
      const jobs = await this.#readAll()
      let recovered = false
      for (const job of jobs) {
        if (job.status !== "running") continue
        const runningEntries = (job.entries || []).filter(
          (entry) => entry.status === "running",
        )
        const stale = runningEntries.some(
          (entry) =>
            now.getTime() - new Date(entry.lockedAt || 0).getTime() >
            STALE_RUNNING_MS,
        )
        if (!stale) continue
        for (const entry of runningEntries) {
          entry.status = "uncertain"
          entry.error =
            "上次写入在完成确认前中断，为避免重复渠道，已停止自动重试"
          delete entry.lockedAt
        }
        job.status = "attention"
        job.lastError =
          "上次执行中断，存在未确认结果；为避免重复渠道，未自动重放。"
        recovered = true
      }
      const job = jobs.find(predicate)
      if (!job) {
        if (recovered) await this.#writeAll(jobs)
        return null
      }
      const pending = job.entries
        .filter(
          (entry) =>
            entry.status === "pending" &&
            (!entry.retryNotBefore ||
              new Date(entry.retryNotBefore).getTime() <= now.getTime()),
        )
        .slice(0, job.batchSize)
      if (pending.length === 0) {
        if (recovered) await this.#writeAll(jobs)
        return null
      }
      for (const entry of pending) {
        entry.status = "running"
        entry.lockedAt = now.toISOString()
      }
      job.status = "running"
      job.lastError = ""
      await this.#writeAll(jobs)
      const keys = await Promise.all(
        pending.map(async (entry) => ({
          id: entry.id,
          apiKey: await this.#decrypt(entry.encryptedKey),
          quota: Number.isFinite(entry.quota) ? entry.quota : null,
          priorityIndex: Number.isInteger(entry.priorityIndex)
            ? entry.priorityIndex
            : 0,
        })),
      )
      return {
        id: job.id,
        preview: { ...job.preview, keys },
        createOptions: job.createOptions || {},
      }
    })
  }

  async completeRun(jobId, result, now = this.now()) {
    return await this.#mutate(async () => {
      const jobs = await this.#readAll()
      const job = jobs.find((item) => item.id === jobId)
      if (!job) throw new Error("定时任务不存在")
      const running = job.entries.filter((entry) => entry.status === "running")
      const resultItems = [
        ...(result.results || result.records || []),
        ...(result.failures || []),
      ].filter(Boolean)
      const byEntryId = new Map(
        resultItems
          .filter((item) => item.entryId)
          .map((item) => [String(item.entryId), item]),
      )
      const byIndex = new Map(
        resultItems
          .filter((item) => Number.isInteger(Number(item.keyIndex)))
          .map((item) => [Number(item.keyIndex), item]),
      )
      let rateLimitedCount = 0
      let uncertainCount = 0
      let latestRetryNotBefore = 0
      for (const [index, entry] of running.entries()) {
        const keyIndex = index + 1
        const item = byEntryId.get(entry.id) || byIndex.get(keyIndex)
        if (!item) {
          entry.status = "uncertain"
          entry.error =
            "未收到这条 Key 的明确写入结果，为避免重复渠道，已停止自动重试"
          delete entry.lockedAt
          delete entry.retryNotBefore
          uncertainCount += 1
          continue
        }
        if (item.success === false) {
          if (isRateLimitFailure(item)) {
            const retryDelay = Number.isFinite(item.retryAfterMs)
              ? Math.max(0, item.retryAfterMs)
              : DEFAULT_RATE_LIMIT_RETRY_MS
            const retryNotBefore = now.getTime() + retryDelay
            entry.status = "pending"
            entry.error = "New API 限流，已自动排队重试"
            entry.retryNotBefore = new Date(retryNotBefore).toISOString()
            entry.retryCount = Number.isInteger(entry.retryCount)
              ? entry.retryCount + 1
              : 1
            delete entry.lockedAt
            rateLimitedCount += 1
            latestRetryNotBefore = Math.max(
              latestRetryNotBefore,
              retryNotBefore,
            )
            continue
          }
          entry.status = "failed"
          entry.error = item.error || "写入失败"
          delete entry.lockedAt
          delete entry.retryNotBefore
          continue
        }
        const record = item.record || item || {}
        entry.status = "imported"
        entry.error = ""
        entry.channelId = record.channelId || item.channelId
        entry.channelName =
          record.channelName || item.channelName || result.channelName || ""
        entry.importedAt = now.toISOString()
        delete entry.lockedAt
        delete entry.retryNotBefore
      }
      const hasPending = job.entries.some((entry) => entry.status === "pending")
      const hasAttention = job.entries.some((entry) =>
        ["failed", "uncertain"].includes(entry.status),
      )
      job.status = hasPending
        ? rateLimitedCount > 0 || job.intervalMinutes > 0
          ? "active"
          : "paused"
        : hasAttention
          ? "attention"
          : "completed"
      job.lastRunAt = now.toISOString()
      job.lastResult = {
        success: result.success !== false,
        successCount: result.successCount || 0,
        failedCount: result.failedCount || 0,
        channelName: result.channelName || "",
      }
      const statusMessages = []
      if (rateLimitedCount > 0) {
        statusMessages.push(
          `${rateLimitedCount} 条 Key 触发 New API 限流，已自动排队重试。`,
        )
      }
      if (uncertainCount > 0) {
        statusMessages.push(
          `${uncertainCount} 条 Key 的结果未确认，为避免重复渠道，已停止自动重试。`,
        )
      }
      if (job.status === "paused") {
        statusMessages.push(
          "还有 Key 未写入；间隔为 0，已暂停，手动立即执行可继续。",
        )
      }
      job.lastError = statusMessages.join(" ")
      if (job.status === "active") {
        const intervalAt = now.getTime() + job.intervalMinutes * 60 * 1000
        job.nextRunAt = new Date(
          Math.max(intervalAt, latestRetryNotBefore),
        ).toISOString()
      }
      await this.#writeAll(jobs)
      return publicJob(job)
    })
  }

  async failRun(jobId, error, now = this.now()) {
    return await this.#mutate(async () => {
      const jobs = await this.#readAll()
      const job = jobs.find((item) => item.id === jobId)
      if (!job) throw new Error("定时任务不存在")
      for (const entry of job.entries) {
        if (entry.status === "running") {
          entry.status = "pending"
          delete entry.lockedAt
        }
      }
      job.status = "active"
      job.lastRunAt = now.toISOString()
      job.lastError = error instanceof Error ? error.message : "定时写入失败"
      job.nextRunAt = new Date(
        now.getTime() + Math.max(1, job.intervalMinutes || 5) * 60 * 1000,
      ).toISOString()
      await this.#writeAll(jobs)
      return publicJob(job)
    })
  }

  async updateSchedule(jobId, schedule) {
    return await this.#mutate(async () => {
      const jobs = await this.#readAll()
      const job = jobs.find((item) => item.id === jobId)
      if (!job) throw new Error("定时任务不存在")
      if (!["active", "paused"].includes(job.status)) {
        throw new Error("只有等待执行或已暂停的任务可以修改")
      }
      if (!(job.entries || []).some((entry) => entry.status === "pending")) {
        throw new Error("该任务没有待写入的 Key")
      }
      const options = normalizeScheduleOptions(schedule)
      job.batchSize = options.batchSize
      job.intervalMinutes = options.intervalMinutes
      job.nextRunAt = options.nextRunAt
      await this.#writeAll(jobs)
      return publicJob(job)
    })
  }

  async retryFailed(jobId, now = this.now()) {
    return await this.#mutate(async () => {
      const jobs = await this.#readAll()
      const job = jobs.find((item) => item.id === jobId)
      if (!job) throw new Error("定时任务不存在")
      if (job.status === "running") {
        throw new Error("任务正在执行，请结束后再重试失败 Key")
      }
      if (job.status === "cancelled") {
        throw new Error("已取消的任务不能重试失败 Key")
      }
      const failedEntries = (job.entries || []).filter(
        (entry) => entry.status === "failed",
      )
      if (failedEntries.length === 0) throw new Error("没有可重试的失败 Key")
      for (const entry of failedEntries) {
        entry.status = "pending"
        entry.retryCount = Number.isInteger(entry.retryCount)
          ? entry.retryCount + 1
          : 1
        delete entry.lockedAt
        delete entry.retryNotBefore
      }
      job.status = "active"
      job.nextRunAt = now.toISOString()
      job.lastError = ""
      await this.#writeAll(jobs)
      return publicJob(job)
    })
  }

  async updateStatus(jobId, status) {
    return await this.#mutate(async () => {
      const jobs = await this.#readAll()
      const job = jobs.find((item) => item.id === jobId)
      if (!job) throw new Error("定时任务不存在")
      if (!["active", "paused", "cancelled"].includes(status)) {
        throw new Error("定时任务状态不正确")
      }
      job.status = status
      if (
        status === "active" &&
        new Date(job.nextRunAt).getTime() < Date.now()
      ) {
        job.nextRunAt = this.now().toISOString()
      }
      await this.#writeAll(jobs)
      return publicJob(job)
    })
  }
}
