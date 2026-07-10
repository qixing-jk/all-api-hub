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

const SCHEDULES_PATH = join(DATA_DIR, "schedules.json")
const SECRET_PATH = join(DATA_DIR, "schedule-secret.key")
const MAX_JOBS = 100
const MIN_BATCH_SIZE = 1
const MAX_BATCH_SIZE = 200
const MAX_INTERVAL_MINUTES = 30 * 24 * 60
const STALE_RUNNING_MS = 30 * 60 * 1000

const clampInteger = (value, fallback, min, max) => {
  const integer = Number.parseInt(String(value ?? ""), 10)
  if (!Number.isInteger(integer)) return fallback
  return Math.min(max, Math.max(min, integer))
}

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
})

const jobCounts = (job) => {
  const entries = Array.isArray(job.entries) ? job.entries : []
  return {
    total: entries.length,
    pending: entries.filter((entry) => entry.status === "pending").length,
    imported: entries.filter((entry) => entry.status === "imported").length,
    failed: entries.filter((entry) => entry.status === "failed").length,
  }
}

const publicJob = (job) => ({
  id: job.id,
  name: job.name,
  providerName: job.providerName,
  targetName: job.targetName,
  targetUrl: job.targetUrl,
  status: job.status,
  batchSize: job.batchSize,
  intervalMinutes: job.intervalMinutes,
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
  } = {}) {
    this.path = path
    this.secretPath = secretPath
    this.now = now
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
    try {
      const value = JSON.parse(await readFile(this.path, "utf8"))
      return Array.isArray(value) ? value : []
    } catch {
      return []
    }
  }

  async #writeAll(jobs) {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
    await writeFile(
      this.path,
      `${JSON.stringify(jobs.slice(0, MAX_JOBS), null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    )
  }

  async #mutate(operation) {
    const result = this.#mutation.then(operation, operation)
    this.#mutation = result.catch(() => {})
    return await result
  }

  async list() {
    return (await this.#readAll()).map(publicJob)
  }

  async create({ preview, createOptions, schedule }) {
    return await this.#mutate(async () => {
      const options = normalizeScheduleOptions(schedule)
      const entries = await Promise.all(
        preview.keys.map(async (entry) => ({
          id: randomUUID(),
          status: "pending",
          quota: Number.isFinite(entry.quota) ? entry.quota : null,
          ...keyIdentity(entry.apiKey),
          encryptedKey: await this.#encrypt(entry.apiKey),
        })),
      )
      if (entries.length === 0) throw new Error("没有可定时写入的 Key")
      const { keys, duplicates, ...storedPreview } = preview
      const job = {
        id: randomUUID(),
        name: `${preview.name} · 定时上 Key`.slice(0, 100),
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
      await this.#writeAll([job, ...(await this.#readAll())])
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
          entry.status = "pending"
          delete entry.lockedAt
        }
        job.status = "active"
        job.lastError = "上次执行中断，未确认的 Key 已重新排队。"
        recovered = true
      }
      const job = jobs.find(predicate)
      if (!job) {
        if (recovered) await this.#writeAll(jobs)
        return null
      }
      const pending = job.entries
        .filter((entry) => entry.status === "pending")
        .slice(0, job.batchSize)
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
      const failures = new Map(
        (result.failures || result.results || [])
          .filter((item) => item && item.success === false)
          .map((item) => [Number(item.keyIndex), item.error || "写入失败"]),
      )
      const resultItems = result.results || result.records || []
      const successfulByIndex = new Map(
        resultItems
          .filter((item) => item && item.success !== false)
          .map((item) => [Number(item.keyIndex), item]),
      )
      for (const [index, entry] of running.entries()) {
        const keyIndex = index + 1
        const failed = failures.get(keyIndex)
        if (failed) {
          entry.status = "failed"
          entry.error = failed
          continue
        }
        const item = successfulByIndex.get(keyIndex) || resultItems[index] || {}
        const record = item.record || item || {}
        entry.status = "imported"
        entry.error = ""
        entry.channelId = record.channelId || item.channelId
        entry.channelName =
          record.channelName || item.channelName || result.channelName || ""
        entry.importedAt = now.toISOString()
      }
      job.status = job.entries.some((entry) => entry.status === "pending")
        ? job.intervalMinutes > 0
          ? "active"
          : "paused"
        : "completed"
      job.lastRunAt = now.toISOString()
      job.lastResult = {
        success: result.success !== false,
        successCount: result.successCount || 0,
        failedCount: result.failedCount || 0,
        channelName: result.channelName || "",
      }
      job.lastError =
        job.status === "paused"
          ? "还有 Key 未写入；间隔为 0，已暂停，手动立即执行可继续。"
          : ""
      if (job.status === "active") {
        job.nextRunAt = new Date(
          now.getTime() + job.intervalMinutes * 60 * 1000,
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
