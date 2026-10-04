import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  appendLogHistory,
  clearLogHistory,
  listLogHistory,
  LOG_HISTORY_LIMIT,
  LOG_HISTORY_RETENTION_MS,
  subscribeToLogHistory,
} from "~/services/logging/logHistory"

const storage = new Storage({ area: "local" })
const now = Date.now()
const entry = (id: string, timestamp = now) => ({
  id,
  timestamp,
  level: "info",
  context: "Content",
  scope: "AccountDetection",
  message: "Reading dashboard session",
  details: { requestId: "detection-1" },
})

describe("local log history", () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    await clearLogHistory()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("persists concurrent entries and retains them after reloading the module", async () => {
    await Promise.all([
      appendLogHistory(entry("first")),
      appendLogHistory(entry("second", now + 1)),
    ])
    vi.resetModules()
    const reloaded = await import("~/services/logging/logHistory")
    expect((await reloaded.listLogHistory()).map((row) => row.id)).toEqual([
      "second",
      "first",
    ])
  })

  it.each([
    undefined,
    { version: 2, entries: [] },
    { version: 1, entries: null },
  ])(
    "starts empty for absent or unsupported stored history: %j",
    async (stored) => {
      if (stored === undefined) await storage.remove(STORAGE_KEYS.LOG_HISTORY)
      else await storage.set(STORAGE_KEYS.LOG_HISTORY, stored)
      expect(await listLogHistory()).toEqual([])
      await appendLogHistory(entry("new-history"))
      expect((await listLogHistory()).map((row) => row.id)).toEqual([
        "new-history",
      ])
    },
  )

  it("evicts expired and overflowing entries", async () => {
    await storage.set(STORAGE_KEYS.LOG_HISTORY, {
      version: 1,
      entries: [
        entry("expired", now - LOG_HISTORY_RETENTION_MS - 1),
        ...Array.from({ length: LOG_HISTORY_LIMIT }, (_, index) =>
          entry(`old-${index}`, now - index - 1),
        ),
      ],
    })
    await appendLogHistory(entry("latest"))
    const rows = await listLogHistory()
    expect(rows).toHaveLength(LOG_HISTORY_LIMIT)
    expect(rows[0]?.id).toBe("latest")
    expect(
      rows.some(
        (row) =>
          row.id === "expired" || row.id === `old-${LOG_HISTORY_LIMIT - 1}`,
      ),
    ).toBe(false)
    vi.setSystemTime(now + LOG_HISTORY_RETENTION_MS + 1)
    expect(await listLogHistory()).toEqual([])
  })

  it("returns readable history when optional pruning write-back fails", async () => {
    await storage.set(STORAGE_KEYS.LOG_HISTORY, {
      version: 1,
      entries: [
        entry("recent"),
        entry("expired", now - LOG_HISTORY_RETENTION_MS - 1),
      ],
    })
    vi.spyOn(browser.storage.local, "set").mockRejectedValueOnce(
      new Error("quota exceeded"),
    )
    await expect(listLogHistory()).resolves.toEqual([
      expect.objectContaining({ id: "recent" }),
    ])
  })

  it("redacts credentials in messages, nested payloads and errors before persistence", async () => {
    await appendLogHistory({
      ...entry("private"),
      message:
        "Unauthorized Bearer message-secret https://example.com/path?token=url-secret#fragment",
      details: {
        requestId: "detection-1",
        password: "password-secret",
        refresh_token: "refresh-secret",
        session: { sid: "session-secret" },
        error: new Error("authorization=error-secret"),
        nested: { value: "apiKey=text-secret" },
      },
    })
    const persisted = JSON.stringify(
      await storage.get(STORAGE_KEYS.LOG_HISTORY),
    )
    for (const secret of [
      "message-secret",
      "url-secret",
      "password-secret",
      "refresh-secret",
      "session-secret",
      "error-secret",
      "text-secret",
    ]) {
      expect(persisted).not.toContain(secret)
    }
    expect(persisted).toContain("[REDACTED]")
    expect(persisted).toContain("requestId")
  })

  it("does not overwrite history after a failed storage read", async () => {
    await appendLogHistory(entry("original"))
    const before = await storage.get(STORAGE_KEYS.LOG_HISTORY)
    const getSpy = vi
      .spyOn(browser.storage.local, "get")
      .mockRejectedValueOnce(new Error("read failed"))
    await expect(appendLogHistory(entry("lost"))).rejects.toThrow("read failed")
    getSpy.mockRestore()
    expect(await storage.get(STORAGE_KEYS.LOG_HISTORY)).toEqual(before)
    await appendLogHistory(entry("recovered"))
    expect((await listLogHistory()).map((row) => row.id)).toEqual(
      expect.arrayContaining(["original", "lost", "recovered"]),
    )
  })

  it("retains a failed batch and concurrent logs until a later producer retries", async () => {
    let rejectWrite!: (error: Error) => void
    const write = vi.spyOn(browser.storage.local, "set").mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          rejectWrite = reject
        }),
    )
    const first = appendLogHistory(entry("failed-batch"))
    const firstFailure = expect(first).rejects.toThrow("write failed")
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1))
    const concurrent = appendLogHistory(entry("during-write"))
    const concurrentFailure = expect(concurrent).rejects.toThrow("write failed")
    rejectWrite(new Error("write failed"))
    await Promise.all([firstFailure, concurrentFailure])
    expect(write).toHaveBeenCalledTimes(1)
    await appendLogHistory(entry("retry-trigger"))
    expect((await listLogHistory()).map((row) => row.id)).toEqual(
      expect.arrayContaining(["failed-batch", "during-write", "retry-trigger"]),
    )
  })

  it("clear removes queued older logs without resurrecting them", async () => {
    const append = appendLogHistory(entry("before-clear"))
    await clearLogHistory()
    await append
    expect(await listLogHistory()).toEqual([])
    await appendLogHistory(entry("after-clear"))
    expect((await listLogHistory()).map((row) => row.id)).toEqual([
      "after-clear",
    ])
  })

  it("clear discards failed batches before a new producer retries", async () => {
    vi.spyOn(browser.storage.local, "get").mockRejectedValueOnce(
      new Error("read failed"),
    )
    await expect(appendLogHistory(entry("before-clear"))).rejects.toThrow(
      "read failed",
    )
    await clearLogHistory()
    await appendLogHistory(entry("after-clear"))
    expect((await listLogHistory()).map((row) => row.id)).toEqual([
      "after-clear",
    ])
  })

  it("bounds the stored byte size even for large Unicode details", async () => {
    await Promise.all(
      Array.from({ length: 250 }, (_, index) =>
        appendLogHistory({
          ...entry(`large-${index}`),
          details: { message: "日志".repeat(10000) },
        }),
      ),
    )
    const retained = await listLogHistory()
    expect(retained.length).toBeGreaterThan(0)
    expect(retained.length).toBeLessThan(250)
    const stored = await storage.get(STORAGE_KEYS.LOG_HISTORY)
    expect(
      new TextEncoder().encode(JSON.stringify(stored)).length,
    ).toBeLessThan(1024 * 1024 + 100)
  })

  it("redacts serialized JSON payloads nested inside log details", async () => {
    await appendLogHistory({
      ...entry("serialized"),
      details: {
        body: JSON.stringify({
          password: "json-password-secret",
          headers: { "X-Auth-Session": "json-session-secret" },
        }),
      },
    })
    const stored = JSON.stringify(await storage.get(STORAGE_KEYS.LOG_HISTORY))
    expect(stored).not.toContain("json-password-secret")
    expect(stored).not.toContain("json-session-secret")
  })

  it("ignores malformed entries and retains bounded plain text details", async () => {
    await Promise.all([
      appendLogHistory(null),
      appendLogHistory({ ...entry("bad-date"), timestamp: NaN }),
      appendLogHistory({ ...entry("bad-level"), level: "trace" }),
      appendLogHistory({ ...entry("plain"), details: "Bearer private-token" }),
      appendLogHistory({ ...entry("long"), details: "x".repeat(10_000) }),
      appendLogHistory({ ...entry("without-details"), details: null }),
    ])
    const rows = await listLogHistory()
    expect(rows).toHaveLength(3)
    expect(rows.find((row) => row.id === "plain")?.details).toBe(
      "Bearer [REDACTED]",
    )
    expect(rows.find((row) => row.id === "long")?.details).toHaveLength(8001)
    expect(rows.find((row) => row.id === "without-details")?.details).toBeNull()
  })

  it("bounds the pending queue during a large concurrent log burst", async () => {
    await Promise.all(
      Array.from({ length: LOG_HISTORY_LIMIT + 5 }, (_, index) =>
        appendLogHistory(entry(`burst-${index}`, now + index)),
      ),
    )
    const rows = await listLogHistory()
    expect(rows).toHaveLength(LOG_HISTORY_LIMIT)
    expect(rows[0]?.id).toBe(`burst-${LOG_HISTORY_LIMIT + 4}`)
    expect(rows.some((row) => row.id === "burst-0")).toBe(false)
  })

  it("notifies only for local history changes and removes its listener", () => {
    const addListener = vi.spyOn(browser.storage.onChanged, "addListener")
    const removeListener = vi.spyOn(browser.storage.onChanged, "removeListener")
    const changed = vi.fn()
    const unsubscribe = subscribeToLogHistory(changed)
    const listener = addListener.mock.calls.at(-1)![0]
    listener({ unrelated: { newValue: 1 } }, "local")
    listener({ [STORAGE_KEYS.LOG_HISTORY]: { newValue: [] } }, "sync")
    expect(changed).not.toHaveBeenCalled()
    listener({ [STORAGE_KEYS.LOG_HISTORY]: { newValue: [] } }, "local")
    expect(changed).toHaveBeenCalledTimes(1)
    unsubscribe()
    expect(removeListener).toHaveBeenCalledWith(listener)
  })
})
