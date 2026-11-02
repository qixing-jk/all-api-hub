import { afterEach, describe, expect, it, vi } from "vitest"

describe("storageWriteLock", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as any).navigator
  })

  it("serializes same-lock work with the in-memory queue when Web Locks are unavailable", async () => {
    const { withExtensionStorageWriteLock } = await import(
      "~/services/core/storageWriteLock"
    )

    const events: string[] = []
    let releaseFirst: (() => void) | undefined

    const first = withExtensionStorageWriteLock("prefs", async () => {
      events.push("first:start")
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      events.push("first:end")
      return "first"
    })

    const second = withExtensionStorageWriteLock("prefs", async () => {
      events.push("second:start")
      events.push("second:end")
      return "second"
    })

    await Promise.resolve()
    expect(events).toEqual(["first:start"])

    releaseFirst?.()

    await expect(first).resolves.toBe("first")
    await expect(second).resolves.toBe("second")
    expect(events).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
    ])
  })

  it.each([false, true])(
    "uses Web Locks with requireCrossContext=%s",
    async (requireCrossContext) => {
      const request = vi.fn(
        async (
          name: string,
          options: LockOptions,
          callback: (lock: Lock | null) => Promise<string>,
        ) => {
          expect(name).toBe("prefs")
          expect(options).toEqual({ mode: "exclusive" })
          return callback(null)
        },
      )
      ;(globalThis as any).navigator = {
        locks: { request },
      }

      const { withExtensionStorageWriteLock } = await import(
        "~/services/core/storageWriteLock"
      )

      const result = await withExtensionStorageWriteLock(
        "prefs",
        async () => "done",
        { requireCrossContext },
      )

      expect(result).toBe("done")
      expect(request).toHaveBeenCalledTimes(1)
    },
  )

  it("rejects strict work before executing when Web Locks are unavailable", async () => {
    const {
      withExtensionStorageWriteLock,
      CrossContextStorageLockUnavailableError,
    } = await import("~/services/core/storageWriteLock")
    const work = vi.fn(async () => "must not run")
    await expect(
      withExtensionStorageWriteLock("prefs", work, {
        requireCrossContext: true,
      }),
    ).rejects.toBeInstanceOf(CrossContextStorageLockUnavailableError)
    expect(work).not.toHaveBeenCalled()
  })

  it("falls back to the in-memory queue when navigator.locks exists without a request function", async () => {
    ;(globalThis as any).navigator = {
      locks: {},
    }

    const { withExtensionStorageWriteLock } = await import(
      "~/services/core/storageWriteLock"
    )

    await expect(
      withExtensionStorageWriteLock("prefs", async () => "done"),
    ).resolves.toBe("done")
  })
})
