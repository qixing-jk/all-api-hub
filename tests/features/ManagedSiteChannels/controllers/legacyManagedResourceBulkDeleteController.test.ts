import { describe, expect, it, vi } from "vitest"

import {
  LegacyManagedResourceBulkDeleteController,
  type LegacyManagedResourceDeleteTarget,
} from "~/features/ManagedSiteChannels/controllers/legacyManagedResourceBulkDeleteController"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"

const createDeferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

const targets: LegacyManagedResourceDeleteTarget[] = [
  { rowKey: "row-alpha", channelId: 1, displayLabel: "Alpha" },
  { rowKey: "row-beta", channelId: 2, displayLabel: "Beta" },
  { rowKey: "row-gamma", channelId: 3, displayLabel: "Gamma" },
  { rowKey: "row-delta", channelId: 4, displayLabel: "Delta" },
  { rowKey: "row-epsilon", channelId: 5, displayLabel: "Epsilon" },
  { rowKey: "row-zeta", channelId: 6, displayLabel: "Zeta" },
]

describe("LegacyManagedResourceBulkDeleteController", () => {
  it("snapshots selected rows and preserves their order with a concurrency limit of four", async () => {
    const controller = new LegacyManagedResourceBulkDeleteController()
    const mutableTargets = targets.map((target) => ({ ...target }))
    expect(controller.schedule(mutableTargets)).toBe(true)

    mutableTargets.reverse()
    mutableTargets[0].displayLabel = "Changed after confirmation"

    const deferredById = new Map<
      number,
      ReturnType<typeof createDeferred<{ success: boolean; message: string }>>
    >()
    const started: number[] = []
    let active = 0
    let maxActive = 0
    const executePromise = controller.execute({
      resolveDelete: async () => async (target) => {
        started.push(target.channelId)
        active += 1
        maxActive = Math.max(maxActive, active)
        const deferred = createDeferred<{
          success: boolean
          message: string
        }>()
        deferredById.set(target.channelId, deferred)
        try {
          return await deferred.promise
        } finally {
          active -= 1
        }
      },
      refresh: vi.fn().mockResolvedValue(true),
    })

    await vi.waitFor(() => expect(started).toEqual([1, 2, 3, 4]))
    deferredById.get(4)?.resolve({ success: true, message: "ok" })
    await vi.waitFor(() => expect(started).toEqual([1, 2, 3, 4, 5]))
    deferredById.get(1)?.resolve({ success: true, message: "ok" })
    await vi.waitFor(() => expect(started).toEqual([1, 2, 3, 4, 5, 6]))

    for (const id of [2, 3, 5, 6]) {
      deferredById.get(id)?.resolve({ success: true, message: "ok" })
    }

    const execution = await executePromise

    expect(maxActive).toBe(4)
    expect(execution?.results.map((result) => result.rowKey)).toEqual(
      targets.map((target) => target.rowKey),
    )
    expect(execution?.results.map((result) => result.displayLabel)).toEqual(
      targets.map((target) => target.displayLabel),
    )
  })

  it("maps confirmed failures to failed and post-dispatch transport loss to uncertain before refreshing once", async () => {
    const controller = new LegacyManagedResourceBulkDeleteController()
    controller.schedule(targets)
    const refresh = vi.fn().mockResolvedValue(false)

    const execution = await controller.execute({
      resolveDelete: async () => async (target) => {
        switch (target.channelId) {
          case 1:
            return { success: true, message: "ok" }
          case 2:
            throw new ApiError(
              "backend rejected",
              400,
              "/api/channel/2",
              API_ERROR_CODES.BUSINESS_ERROR,
            )
          case 3:
            throw new TypeError("Failed to fetch")
          case 4:
            return { success: false, message: "confirmed rejection" }
          case 5:
            throw new DOMException("Aborted", "AbortError")
          default:
            throw new Error("validation failed")
        }
      },
      refresh,
    })

    expect(execution?.results.map((result) => result.status)).toEqual([
      "success",
      "failed",
      "uncertain",
      "failed",
      "uncertain",
      "failed",
    ])
    expect(execution?.requiresRefresh).toBe(true)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("honors controlled uncertain certainty returned by the managed-site service", async () => {
    const controller = new LegacyManagedResourceBulkDeleteController()
    controller.schedule(targets.slice(0, 2))

    const execution = await controller.execute({
      resolveDelete: async () => async (target) =>
        target.channelId === 1
          ? {
              success: false,
              message: "transport unavailable",
              certainty: "uncertain" as const,
            }
          : {
              success: false,
              message: "backend rejected",
            },
      refresh: vi.fn().mockResolvedValue(false),
    })

    expect(execution?.results.map((result) => result.status)).toEqual([
      "uncertain",
      "failed",
    ])
    expect(execution?.requiresRefresh).toBe(true)
  })

  it("reports pre-dispatch setup failures as failed without dispatch or refresh", async () => {
    const controller = new LegacyManagedResourceBulkDeleteController()
    controller.schedule(targets.slice(0, 2))
    const refresh = vi.fn()

    const execution = await controller.execute({
      resolveDelete: async () => {
        throw new Error("configuration unavailable")
      },
      refresh,
    })

    expect(execution?.results.map((result) => result.status)).toEqual([
      "failed",
      "failed",
    ])
    expect(execution?.failure).toMatchObject({
      message: "configuration unavailable",
    })
    expect(refresh).not.toHaveBeenCalled()
  })

  it("blocks replay after an uncertain batch until a fresh read is accepted", async () => {
    const controller = new LegacyManagedResourceBulkDeleteController()
    controller.schedule(targets.slice(0, 1))
    const deleteChannel = vi
      .fn()
      .mockRejectedValue(new TypeError("Network request failed"))

    const execution = await controller.execute({
      resolveDelete: async () => deleteChannel,
      refresh: vi.fn().mockResolvedValue(false),
    })

    expect(execution?.requiresRefresh).toBe(true)
    expect(controller.schedule(targets.slice(0, 1))).toBe(false)
    expect(
      await controller.execute({
        resolveDelete: async () => deleteChannel,
        refresh: vi.fn().mockResolvedValue(false),
      }),
    ).toBeNull()
    expect(deleteChannel).toHaveBeenCalledTimes(1)

    controller.markRefreshAccepted()
    expect(controller.schedule(targets.slice(0, 1))).toBe(true)
  })

  it("rejects reentrant scheduling while the current batch is executing", async () => {
    const controller = new LegacyManagedResourceBulkDeleteController()
    controller.schedule(targets.slice(0, 1))
    const deletion = createDeferred<{ success: boolean; message: string }>()

    const executionPromise = controller.execute({
      resolveDelete: async () => async () => await deletion.promise,
      refresh: vi.fn().mockResolvedValue(true),
    })

    await vi.waitFor(() =>
      expect(controller.schedule(targets.slice(1, 2))).toBe(false),
    )
    expect(
      await controller.execute({
        resolveDelete: async () => async () => ({
          success: true,
          message: "ok",
        }),
        refresh: vi.fn().mockResolvedValue(true),
      }),
    ).toBeNull()
    expect(controller.schedule(targets.slice(1, 2))).toBe(false)

    deletion.resolve({ success: true, message: "ok" })
    await executionPromise
    expect(controller.schedule(targets.slice(1, 2))).toBe(true)
  })

  it("invalidates an active generation before it can refresh or publish results", async () => {
    const controller = new LegacyManagedResourceBulkDeleteController()
    controller.schedule(targets.slice(0, 1))
    const deletion = createDeferred<{ success: boolean; message: string }>()
    const refresh = vi.fn().mockResolvedValue(true)

    const executionPromise = controller.execute({
      resolveDelete: async () => async () => await deletion.promise,
      refresh,
    })

    await vi.waitFor(() => expect(controller.schedule([])).toBe(false))
    controller.invalidate()
    deletion.resolve({ success: true, message: "ok" })

    await expect(executionPromise).resolves.toBeNull()
    expect(refresh).not.toHaveBeenCalled()
    expect(controller.schedule(targets.slice(1, 2))).toBe(true)
  })
})
