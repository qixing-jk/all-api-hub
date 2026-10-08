import { describe, expect, it, vi } from "vitest"

import { WebdavSyncRunLifecycle } from "~/services/webdav/webdavSyncRunLifecycle"

describe("cloud sync run lifecycle", () => {
  it("keeps the shared lease until completion feedback finishes", async () => {
    const lifecycle = new WebdavSyncRunLifecycle()
    let complete!: () => void
    const feedback = new Promise<void>((resolve) => {
      complete = resolve
    })
    const running = lifecycle.run(async () => {}, { success: () => feedback })
    await Promise.resolve()
    const competing = vi.fn()
    expect(await lifecycle.run(competing)).toEqual({ kind: "busy" })
    expect(competing).not.toHaveBeenCalled()
    expect(lifecycle.getStatus()).toMatchObject({
      isSyncing: true,
      lastSyncStatus: "success",
    })
    complete()
    expect(await running).toEqual({ kind: "success" })
    expect(lifecycle.getStatus().isSyncing).toBe(false)
  })

  it("releases failed work and clears the error on the next successful run", async () => {
    const lifecycle = new WebdavSyncRunLifecycle()
    const error = new Error("sync failed")
    expect(
      await lifecycle.run(async () => {
        throw error
      }),
    ).toEqual({ kind: "error", error })
    expect(lifecycle.getStatus()).toMatchObject({
      isSyncing: false,
      lastSyncStatus: "error",
      lastSyncError: "sync failed",
    })
    expect(await lifecycle.run(async () => {})).toEqual({ kind: "success" })
    expect(lifecycle.getStatus()).toMatchObject({
      isSyncing: false,
      lastSyncStatus: "success",
      lastSyncError: null,
    })
    expect(lifecycle.getStatus().lastSyncTime).toBeGreaterThan(0)
  })

  it("releases the lease even when failure feedback throws", async () => {
    const lifecycle = new WebdavSyncRunLifecycle()
    await expect(
      lifecycle.run(
        async () => {
          throw new Error("work")
        },
        {
          failure: async () => {
            throw new Error("feedback")
          },
        },
      ),
    ).rejects.toThrow("feedback")
    expect(lifecycle.getStatus().isSyncing).toBe(false)
  })
})
