import { describe, expect, it, vi } from "vitest"

import {
  LegacyManagedResourceBulkDeleteController,
  type LegacyManagedResourceDeleteTarget,
} from "~/features/ManagedSiteChannels/controllers/legacyManagedResourceBulkDeleteController"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_SITE_MUTATION_COMPLETIONS,
  MANAGED_SITE_MUTATION_EFFECT_KINDS,
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"

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

const deleteSucceeded = (): ManagedSiteMutationResult<void> => ({
  outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
  data: undefined,
  confirmedEffects: [
    {
      kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceDeleted,
      resourceKind: MANAGED_RESOURCE_KINDS.Channel,
    },
  ],
})

const deleteRejected = (message = "backend rejected") => ({
  outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
  diagnostic: { message },
})

const resolvedDelete = (
  deleteTarget: (target: LegacyManagedResourceDeleteTarget) => Promise<unknown>,
  overrides: Partial<{
    confirmMissing: (
      target: LegacyManagedResourceDeleteTarget,
    ) => Promise<boolean>
    knownSecrets: readonly string[]
    knownSecretsComplete: boolean
  }> = {},
) => ({
  deleteTarget,
  confirmMissing: vi.fn(async () => false),
  knownSecrets: [],
  knownSecretsComplete: true,
  ...overrides,
})

describe("LegacyManagedResourceBulkDeleteController", () => {
  it("snapshots selected rows and preserves their order with a concurrency limit of four", async () => {
    const controller = new LegacyManagedResourceBulkDeleteController()
    const mutableTargets = targets.map((target) => ({ ...target }))
    expect(controller.schedule(mutableTargets)).toBe(true)

    mutableTargets.reverse()
    mutableTargets[0].displayLabel = "Changed after confirmation"

    const deferredById = new Map<
      number,
      ReturnType<typeof createDeferred<ManagedSiteMutationResult<void>>>
    >()
    const started: number[] = []
    let active = 0
    let maxActive = 0
    const executePromise = controller.execute({
      resolveDelete: async () =>
        resolvedDelete(async (target) => {
          started.push(target.channelId)
          active += 1
          maxActive = Math.max(maxActive, active)
          const deferred = createDeferred<ManagedSiteMutationResult<void>>()
          deferredById.set(target.channelId, deferred)
          try {
            return await deferred.promise
          } finally {
            active -= 1
          }
        }),
      refresh: vi.fn().mockResolvedValue(true),
    })

    await vi.waitFor(() => expect(started).toEqual([1, 2, 3, 4]))
    deferredById.get(4)?.resolve(deleteSucceeded())
    await vi.waitFor(() => expect(started).toEqual([1, 2, 3, 4, 5]))
    deferredById.get(1)?.resolve(deleteSucceeded())
    await vi.waitFor(() => expect(started).toEqual([1, 2, 3, 4, 5, 6]))

    for (const id of [2, 3, 5, 6]) {
      deferredById.get(id)?.resolve(deleteSucceeded())
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

  it("maps common outcomes before refreshing once", async () => {
    const controller = new LegacyManagedResourceBulkDeleteController()
    controller.schedule(targets)
    const refresh = vi.fn().mockResolvedValue(false)

    const execution = await controller.execute({
      resolveDelete: async () =>
        resolvedDelete(async (target) => {
          switch (target.channelId) {
            case 1:
              return deleteSucceeded()
            case 2:
              return deleteRejected()
            case 3:
              return {
                outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
                diagnostic: { message: "transport unavailable" },
              }
            case 4:
              return {
                outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
                confirmedEffects: [
                  {
                    kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceDeleted,
                    resourceKind: MANAGED_RESOURCE_KINDS.Channel,
                  },
                ],
                completion: MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain,
                diagnostic: { message: "partially applied" },
              }
            case 5:
              return {
                outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
                diagnostic: { message: "write state unavailable" },
              }
            default:
              return {
                outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
                diagnostic: { message: "ambiguous" },
              }
          }
        }),
      refresh,
    })

    expect(execution?.results.map((result) => result.status)).toEqual([
      "success",
      "failed",
      "uncertain",
      "uncertain",
      "uncertain",
      "uncertain",
    ])
    expect(execution?.requiresRefresh).toBe(true)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("refreshes and blocks replay before propagating a thrown delete unchanged", async () => {
    const controller = new LegacyManagedResourceBulkDeleteController()
    controller.schedule(targets.slice(0, 1))
    const thrown = new Error("delete programming failure")
    const refresh = vi.fn().mockResolvedValue(false)

    await expect(
      controller.execute({
        resolveDelete: async () =>
          resolvedDelete(async () => {
            throw thrown
          }),
        refresh,
      }),
    ).rejects.toBe(thrown)

    expect(refresh).toHaveBeenCalledOnce()
    expect(controller.requiresRefresh()).toBe(true)
    expect(controller.schedule(targets.slice(1, 2))).toBe(false)
    controller.markRefreshAccepted()
    expect(controller.requiresRefresh()).toBe(false)
    expect(controller.schedule(targets.slice(1, 2))).toBe(true)
  })

  it("keeps replay blocked when the fresh read after a thrown delete also fails", async () => {
    const controller = new LegacyManagedResourceBulkDeleteController()
    controller.schedule(targets.slice(0, 1))
    const thrown = new Error("delete programming failure")
    const refresh = vi.fn().mockRejectedValue(new Error("refresh failed"))

    await expect(
      controller.execute({
        resolveDelete: async () =>
          resolvedDelete(async () => {
            throw thrown
          }),
        refresh,
      }),
    ).rejects.toBe(thrown)

    expect(refresh).toHaveBeenCalledOnce()
    expect(controller.requiresRefresh()).toBe(true)
    expect(controller.schedule(targets.slice(1, 2))).toBe(false)
  })

  it("honors controlled partial and uncertain outcomes without retry", async () => {
    const controller = new LegacyManagedResourceBulkDeleteController()
    controller.schedule(targets.slice(0, 2))

    const execution = await controller.execute({
      resolveDelete: async () =>
        resolvedDelete(async (target) =>
          target.channelId === 1
            ? {
                outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
                diagnostic: { message: "transport unavailable" },
              }
            : deleteRejected(),
        ),
      refresh: vi.fn().mockResolvedValue(false),
    })

    expect(execution?.results.map((result) => result.status)).toEqual([
      "uncertain",
      "failed",
    ])
    expect(execution?.requiresRefresh).toBe(true)
  })

  it("treats not_found as success only after a fresh read confirms absence", async () => {
    const controller = new LegacyManagedResourceBulkDeleteController()
    controller.schedule(targets.slice(0, 2))
    const confirmMissing = vi.fn(async (target) => target.channelId === 1)

    const execution = await controller.execute({
      resolveDelete: async () =>
        resolvedDelete(
          async () => ({
            outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
            diagnostic: {
              message: "not found",
              code: "not_found",
            },
          }),
          { confirmMissing },
        ),
      refresh: vi.fn().mockResolvedValue(true),
    })

    expect(execution?.results.map((result) => result.status)).toEqual([
      "success",
      "failed",
    ])
    expect(confirmMissing).toHaveBeenCalledTimes(2)
  })

  it("treats not_found as uncertain when the confirming fresh read fails", async () => {
    const controller = new LegacyManagedResourceBulkDeleteController()
    controller.schedule(targets.slice(0, 1))
    const confirmMissing = vi.fn().mockRejectedValue(new Error("read failed"))

    const execution = await controller.execute({
      resolveDelete: async () =>
        resolvedDelete(
          async () => ({
            outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
            diagnostic: {
              message: "not found",
              code: "not_found",
            },
          }),
          { confirmMissing },
        ),
      refresh: vi.fn().mockResolvedValue(false),
    })

    expect(execution?.results).toEqual([
      expect.objectContaining({ status: "uncertain" }),
    ])
    expect(confirmMissing).toHaveBeenCalledOnce()
    expect(execution?.requiresRefresh).toBe(true)
  })

  it("does not inspect or translate thrown delete failures", async () => {
    const secret = "legacy-delete-secret-placeholder"
    const run = async (knownSecretsComplete: boolean) => {
      const controller = new LegacyManagedResourceBulkDeleteController()
      controller.schedule(targets.slice(0, 1))
      const thrown = new Error(`provider transport ${secret}`)
      const execution = controller.execute({
        resolveDelete: async () =>
          resolvedDelete(
            async () => {
              throw thrown
            },
            { knownSecrets: [secret], knownSecretsComplete },
          ),
        refresh: vi.fn().mockResolvedValue(true),
      })
      await expect(execution).rejects.toBe(thrown)
    }

    await run(true)
    await run(false)
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
    const deleteChannel = vi.fn().mockResolvedValue({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
      diagnostic: { message: "Network request failed" },
    })

    const execution = await controller.execute({
      resolveDelete: async () => resolvedDelete(deleteChannel),
      refresh: vi.fn().mockResolvedValue(false),
    })

    expect(execution?.requiresRefresh).toBe(true)
    expect(controller.schedule(targets.slice(0, 1))).toBe(false)
    expect(
      await controller.execute({
        resolveDelete: async () => resolvedDelete(deleteChannel),
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
    const deletion = createDeferred<ManagedSiteMutationResult<void>>()

    const executionPromise = controller.execute({
      resolveDelete: async () =>
        resolvedDelete(async () => await deletion.promise),
      refresh: vi.fn().mockResolvedValue(true),
    })

    await vi.waitFor(() =>
      expect(controller.schedule(targets.slice(1, 2))).toBe(false),
    )
    expect(
      await controller.execute({
        resolveDelete: async () =>
          resolvedDelete(async () => deleteSucceeded()),
        refresh: vi.fn().mockResolvedValue(true),
      }),
    ).toBeNull()
    expect(controller.schedule(targets.slice(1, 2))).toBe(false)

    deletion.resolve(deleteSucceeded())
    await executionPromise
    expect(controller.schedule(targets.slice(1, 2))).toBe(true)
  })

  it("invalidates an active generation before it can refresh or publish results", async () => {
    const controller = new LegacyManagedResourceBulkDeleteController()
    controller.schedule(targets.slice(0, 1))
    const deletion = createDeferred<ManagedSiteMutationResult<void>>()
    const refresh = vi.fn().mockResolvedValue(true)

    const executionPromise = controller.execute({
      resolveDelete: async () =>
        resolvedDelete(async () => await deletion.promise),
      refresh,
    })

    await vi.waitFor(() => expect(controller.schedule([])).toBe(false))
    controller.invalidate()
    deletion.resolve(deleteSucceeded())

    await expect(executionPromise).resolves.toBeNull()
    expect(refresh).not.toHaveBeenCalled()
    expect(controller.schedule(targets.slice(1, 2))).toBe(true)
  })
})
