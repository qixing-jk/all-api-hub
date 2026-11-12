import { beforeEach, describe, expect, it, vi } from "vitest"

import { changelogOnUpdateState } from "~/services/updates/changelogOnUpdateState"

const storage = vi.hoisted(() => ({
  value: undefined as unknown,
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
}))
vi.mock("@plasmohq/storage", () => ({
  Storage: class {
    get = storage.get
    set = storage.set
    remove = storage.remove
  },
}))

describe("deferred changelog state", () => {
  beforeEach(() => {
    storage.value = undefined
    storage.get.mockReset().mockImplementation(async () => storage.value)
    storage.set
      .mockReset()
      .mockImplementation(async (_key: string, value: unknown) => {
        storage.value = value
      })
    storage.remove.mockReset().mockImplementation(async () => {
      storage.value = undefined
    })
  })
  it("keeps the existing string format and preserves the reminder across reads", async () => {
    await changelogOnUpdateState.setPendingVersion("4.10.1")
    expect(storage.set).toHaveBeenCalledWith(
      "changelogOnUpdate_pendingVersion",
      "4.10.1",
    )
    expect(await changelogOnUpdateState.getPendingVersion()).toBe("4.10.1")
    expect(await changelogOnUpdateState.getPendingVersion()).toBe("4.10.1")
  })
  it.each([undefined, 42, "   "])(
    "treats an absent or malformed marker %j as no pending reminder without rewriting storage",
    async (value) => {
      storage.value = value
      expect(await changelogOnUpdateState.getPendingVersion()).toBeNull()
      expect(storage.set).not.toHaveBeenCalled()
      expect(storage.remove).not.toHaveBeenCalled()
    },
  )
  it("allows only one concurrent settings window to consume a reminder", async () => {
    await changelogOnUpdateState.setPendingVersion("4.10.1")
    expect(
      await Promise.all([
        changelogOnUpdateState.consumePendingVersion("4.10.1"),
        changelogOnUpdateState.consumePendingVersion("4.10.1"),
      ]),
    ).toEqual(["4.10.1", null])
  })
  it("preserves a newer update when an older source check finishes", async () => {
    await changelogOnUpdateState.setPendingVersion("4.11.0")
    expect(
      await changelogOnUpdateState.consumePendingVersion("4.10.1"),
    ).toBeNull()
    expect(await changelogOnUpdateState.getPendingVersion()).toBe("4.11.0")
  })
  it("does not remove a reminder after a failed read", async () => {
    await changelogOnUpdateState.setPendingVersion("4.10.1")
    storage.get.mockRejectedValueOnce(new Error("read failed"))
    await expect(
      changelogOnUpdateState.consumePendingVersion("4.10.1"),
    ).rejects.toThrow("read failed")
    expect(storage.remove).not.toHaveBeenCalled()
    expect(await changelogOnUpdateState.getPendingVersion()).toBe("4.10.1")
  })
  it("keeps a reminder retryable if consuming it fails", async () => {
    await changelogOnUpdateState.setPendingVersion("4.10.1")
    storage.remove.mockRejectedValueOnce(new Error("write failed"))
    await expect(
      changelogOnUpdateState.consumePendingVersion("4.10.1"),
    ).rejects.toThrow("write failed")
    expect(await changelogOnUpdateState.consumePendingVersion("4.10.1")).toBe(
      "4.10.1",
    )
  })
})
