import { describe, expect, it, vi } from "vitest"

import { runModelSyncBatch } from "~/services/models/modelSync/runModelSyncBatch"
import type { ExecutionItemResult } from "~/types/managedSiteModelSync"
import { createDeferred } from "~~/tests/test-utils/deferred"

const resultFor = (id: number): ExecutionItemResult => ({
  resourceRef: {
    siteType: "new-api",
    kind: "channel",
    scopeKey: "https://example.com",
    resourceId: String(id),
  },
  channelName: String(id),
  ok: id !== 2,
  attempts: 1,
  finishedAt: 1,
})

describe("runModelSyncBatch", () => {
  it("serializes delayed progress persistence in completion order", async () => {
    const gate = createDeferred<void>()
    const firstStarted = createDeferred<void>()
    const persisted: number[] = []
    const onProgress = vi.fn(async ({ completed }: { completed: number }) => {
      if (completed === 1) {
        firstStarted.resolve()
        await gate.promise
      }
      persisted.push(completed)
    })
    const batch = runModelSyncBatch(
      [1, 2],
      { concurrency: 2, onProgress },
      async (id) => resultFor(id),
    )
    await firstStarted.promise
    try {
      expect(onProgress).toHaveBeenCalledTimes(1)
    } finally {
      gate.resolve()
      await batch
    }
    expect(persisted).toEqual([1, 2])
  })

  it("does not dispatch the next channel until progress persistence finishes", async () => {
    const gate = createDeferred<void>()
    const progressStarted = createDeferred<void>()
    const execute = vi.fn(async (id: number) => resultFor(id))
    const batch = runModelSyncBatch(
      [1, 2],
      {
        concurrency: 1,
        onProgress: async ({ completed }) => {
          if (completed === 1) {
            progressStarted.resolve()
            await gate.promise
          }
        },
      },
      execute,
    )
    await progressStarted.promise
    expect(execute).toHaveBeenCalledTimes(1)
    gate.resolve()
    await batch
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it("holds each slot through progress persistence and preserves input order", async () => {
    const gate = createDeferred<void>()
    const started: number[] = []
    const onProgress = vi.fn(async ({ lastResult }) => {
      if (lastResult.channelName === "1") await gate.promise
    })
    const batch = runModelSyncBatch(
      [1, 2, 3],
      { concurrency: 2, onProgress },
      async (id) => {
        started.push(id)
        return resultFor(id)
      },
    )
    await vi.waitFor(() => expect(onProgress).toHaveBeenCalledTimes(1))
    expect(started).toEqual([1, 2])
    const settled = vi.fn()
    void batch.then(settled)
    expect(settled).not.toHaveBeenCalled()
    gate.resolve()
    const result = await batch
    expect(result.items).toEqual([1, 2, 3].map(resultFor))
    expect(result.statistics).toMatchObject({
      total: 3,
      successCount: 2,
      failureCount: 1,
    })
    expect(
      onProgress.mock.calls.map(([progress]) => progress.completed),
    ).toEqual([1, 2, 3])
  })

  it.each(["execute", "progress"])(
    "rejects on %s failure while other workers continue",
    async (failureAt) => {
      const gate = createDeferred<void>()
      const continued = createDeferred<void>()
      const failure = new Error("failed")
      const started: number[] = []
      const batch = runModelSyncBatch(
        [1, 2, 3],
        {
          concurrency: 2,
          onProgress: ({ lastResult }) => {
            if (failureAt === "progress" && lastResult.channelName === "1")
              throw failure
            if (lastResult.channelName === "3") continued.resolve()
          },
        },
        async (id) => {
          started.push(id)
          if (id === 1 && failureAt === "execute") throw failure
          if (id === 2) await gate.promise
          return resultFor(id)
        },
      )
      await expect(batch).rejects.toBe(failure)
      expect(started).toEqual([1, 2])
      gate.resolve()
      await continued.promise
      expect(started).toEqual([1, 2, 3])
    },
  )
})
