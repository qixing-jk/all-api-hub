import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  addDevFixtureAccounts,
  clearDevFixtureAccounts,
  countDevFixtureAccounts,
  DEV_FIXTURE_NOTES_LABEL,
} from "~/features/DevPanel/fixtureAccounts"
import { STORAGE_KEYS } from "~/services/core/storageKeys"

const { addAccountMock, deleteAccountsMock, getAllAccountsMock } = vi.hoisted(
  () => ({
    addAccountMock: vi.fn(),
    deleteAccountsMock: vi.fn(),
    getAllAccountsMock: vi.fn(),
  }),
)

vi.mock("~/services/accounts/accountStorage/accountMutations", () => ({
  accountMutations: {
    addAccount: addAccountMock,
    deleteAccounts: deleteAccountsMock,
  },
}))

vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: {
    getAllAccounts: getAllAccountsMock,
  },
}))

/** In-memory stand-in for the extension `local` storage area. */
const storageBacking = new Map<string, unknown>()

vi.mock("@plasmohq/storage", () => ({
  Storage: class {
    async get(key: string) {
      return storageBacking.get(key)
    }

    async set(key: string, value: unknown) {
      storageBacking.set(key, value)
    }

    async remove(key: string) {
      storageBacking.delete(key)
    }
  },
}))

/** Seeds the fixture id registry the way a previous generator run would. */
function seedRegistry(ids: string[]) {
  storageBacking.set(STORAGE_KEYS.DEV_FIXTURE_ACCOUNT_IDS, ids)
}

function readRegistry(): string[] {
  return (storageBacking.get(STORAGE_KEYS.DEV_FIXTURE_ACCOUNT_IDS) ??
    []) as string[]
}

const realAccount = {
  id: "real-1",
  notes: "user notes",
  last_sync_time: 0,
}

describe("dev fixture accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storageBacking.clear()
    addAccountMock.mockImplementation(async () => `fixture-${Date.now()}`)
    deleteAccountsMock.mockResolvedValue({ deletedCount: 0, deletedIds: [] })
    getAllAccountsMock.mockResolvedValue([realAccount])
  })

  it("adds fixture accounts, registers their ids, and keeps check-in off", async () => {
    addAccountMock
      .mockResolvedValueOnce("fixture-a")
      .mockResolvedValueOnce("fixture-b")

    const added = await addDevFixtureAccounts(2)

    expect(added).toBe(2)
    expect(addAccountMock).toHaveBeenCalledTimes(2)
    expect(readRegistry()).toEqual(["fixture-a", "fixture-b"])

    const calls = addAccountMock.mock.calls.map(([account]) => account)
    for (const [index, account] of calls.entries()) {
      expect(account.notes).toContain(DEV_FIXTURE_NOTES_LABEL)
      expect(account.site_url).toBe(
        `https://fixture-${String(index + 1).padStart(2, "0")}.local`,
      )
      expect(account.checkIn.automaticExecutionEnabled).toBe(false)
    }

    // Variants cycle through the UI states the fixtures exist to exercise.
    expect(new Set(calls.map((account) => account.notes)).size).toBe(2)
  })

  it("never stamps last_sync_time in the future", async () => {
    const before = Date.now()
    addAccountMock.mockResolvedValue("fixture-a")

    await addDevFixtureAccounts(3)

    for (const [account] of addAccountMock.mock.calls) {
      expect(account.last_sync_time).toBeLessThanOrEqual(before)
    }
    // Ages vary so relative-time rendering has something to show.
    const syncTimes = addAccountMock.mock.calls.map(
      ([account]) => account.last_sync_time,
    )
    expect(new Set(syncTimes).size).toBe(3)
  })

  it("continues numbering after previously registered fixtures", async () => {
    storageBacking.set(STORAGE_KEYS.DEV_FIXTURE_ACCOUNT_IDS, ["fixture-1"])
    getAllAccountsMock.mockResolvedValue([
      realAccount,
      { id: "fixture-1", notes: `${DEV_FIXTURE_NOTES_LABEL}: healthy` },
    ])
    addAccountMock.mockResolvedValue("fixture-2")

    await addDevFixtureAccounts(1)

    expect(addAccountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        site_name: "Dev Fixture 02",
        site_url: "https://fixture-02.local",
      }),
    )
  })

  it("counts only registered fixtures that still exist", async () => {
    seedRegistry(["fixture-1", "fixture-missing"])
    getAllAccountsMock.mockResolvedValue([
      realAccount,
      { id: "fixture-1", notes: `${DEV_FIXTURE_NOTES_LABEL}: healthy` },
    ])

    await expect(countDevFixtureAccounts()).resolves.toBe(1)
  })

  it("clears registered fixtures without touching look-alike real accounts", async () => {
    seedRegistry(["fixture-1", "fixture-2"])
    // A real account whose notes happen to start like a fixture label must
    // survive: identification comes from the registry, not from notes.
    const lookAlike = {
      id: "real-lookalike",
      notes: `${DEV_FIXTURE_NOTES_LABEL}: healthy`,
      last_sync_time: 0,
    }
    getAllAccountsMock.mockResolvedValue([
      realAccount,
      lookAlike,
      { id: "fixture-1", notes: `${DEV_FIXTURE_NOTES_LABEL}: healthy` },
      { id: "fixture-2", notes: `${DEV_FIXTURE_NOTES_LABEL}: disabled` },
    ])
    deleteAccountsMock.mockResolvedValue({
      deletedCount: 2,
      deletedIds: ["fixture-1", "fixture-2"],
    })

    await expect(clearDevFixtureAccounts()).resolves.toBe(2)
    expect(deleteAccountsMock).toHaveBeenCalledWith(["fixture-1", "fixture-2"])
    expect(readRegistry()).toEqual([])
  })

  it("clears nothing and resets stale ids when no fixtures remain", async () => {
    seedRegistry(["fixture-missing"])

    await expect(clearDevFixtureAccounts()).resolves.toBe(0)
    expect(deleteAccountsMock).not.toHaveBeenCalled()
    expect(readRegistry()).toEqual([])
  })

  it("reports a partial failure instead of registering ids that were not saved", async () => {
    addAccountMock
      .mockResolvedValueOnce("fixture-a")
      .mockRejectedValueOnce(new Error("storage full"))

    const added = await addDevFixtureAccounts(3)

    expect(added).toBe(1)
    expect(readRegistry()).toEqual(["fixture-a"])
  })
})
