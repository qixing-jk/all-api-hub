import { beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"

vi.mock("@plasmohq/storage", () => {
  const set = vi.fn()
  const get = vi.fn()
  const remove = vi.fn()

  /**
   * Minimal mock implementation of the Plasmo Storage class used in tests.
   */
  function Storage(this: any) {
    this.set = set
    this.get = get
    this.remove = remove
  }

  ;(Storage as any).__mocks = { set, get, remove }

  return { Storage, __esModule: true }
})

describe("autoCheckinStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("getStatus should return stored status when present", async () => {
    const status = { lastRunResult: "success" }
    const { get } = (Storage as any).__mocks as {
      set: ReturnType<typeof vi.fn>
      get: ReturnType<typeof vi.fn>
      remove: ReturnType<typeof vi.fn>
    }
    get.mockResolvedValueOnce(status)

    const result = await autoCheckinStorage.getStatus()

    expect(get).toHaveBeenCalledWith("autoCheckin_status")
    expect(result).toEqual(status)
  })

  it("getStatus should return null and log error on failure", async () => {
    const { get } = (Storage as any).__mocks as any
    get.mockRejectedValueOnce(new Error("read error"))

    const result = await autoCheckinStorage.getStatus()

    expect(result).toBeNull()
  })

  it("saveStatus should store status and return true", async () => {
    const { set } = (Storage as any).__mocks as any
    set.mockResolvedValueOnce(undefined)

    const status = { lastRunResult: "success" } as any
    const ok = await autoCheckinStorage.saveStatus(status)

    expect(set).toHaveBeenCalledWith("autoCheckin_status", status)
    expect(ok).toBe(true)
  })

  it("saveStatus should return false on error", async () => {
    const { set } = (Storage as any).__mocks as any
    set.mockRejectedValueOnce(new Error("write error"))

    const ok = await autoCheckinStorage.saveStatus({} as any)

    expect(ok).toBe(false)
  })

  it("clearStatus should remove key and return true", async () => {
    const { remove } = (Storage as any).__mocks as any
    remove.mockResolvedValueOnce(undefined)

    const ok = await autoCheckinStorage.clearStatus()

    expect(remove).toHaveBeenCalledWith("autoCheckin_status")
    expect(ok).toBe(true)
  })

  it("clearStatus should return false on error", async () => {
    const { remove } = (Storage as any).__mocks as any
    remove.mockRejectedValueOnce(new Error("remove error"))

    const ok = await autoCheckinStorage.clearStatus()

    expect(ok).toBe(false)
  })
})
