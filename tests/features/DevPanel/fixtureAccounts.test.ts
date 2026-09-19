import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  addDevFixtureAccounts,
  clearDevFixtureAccounts,
  countDevFixtureAccounts,
  DEV_FIXTURE_NOTES_MARKER,
} from "~/features/DevPanel/fixtureAccounts"

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

const realAccount = { id: "real-1", notes: "user notes" }

describe("dev fixture accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    addAccountMock.mockResolvedValue("fixture-id")
    deleteAccountsMock.mockResolvedValue({
      deletedCount: 0,
      deletedIds: [],
    })
    getAllAccountsMock.mockResolvedValue([realAccount])
  })

  it("adds fixture accounts with the marker, varied states, and no check-in automation", async () => {
    const added = await addDevFixtureAccounts(5)

    expect(added).toBe(5)
    expect(addAccountMock).toHaveBeenCalledTimes(5)

    const calls = addAccountMock.mock.calls.map(([account]) => account)
    for (const [index, account] of calls.entries()) {
      expect(account.notes.startsWith(DEV_FIXTURE_NOTES_MARKER)).toBe(true)
      expect(account.site_url).toBe(
        `https://fixture-${String(index + 1).padStart(2, "0")}.local`,
      )
      expect(account.checkIn.automaticExecutionEnabled).toBe(false)
    }

    // Variants cycle through the UI states the fixtures exist to exercise.
    const variants = new Set(calls.map((account) => account.notes))
    expect(variants.size).toBe(5)
    expect(calls.some((account) => account.disabled)).toBe(true)
    expect(calls.some((account) => account.excludeFromTotalBalance)).toBe(true)
  })

  it("continues numbering after existing fixture accounts", async () => {
    getAllAccountsMock.mockResolvedValue([
      realAccount,
      {
        id: "fixture-1",
        notes: `${DEV_FIXTURE_NOTES_MARKER} healthy`,
        site_url: "https://fixture-01.local",
      },
    ])

    await addDevFixtureAccounts(1)

    expect(addAccountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        site_name: "Dev Fixture 02",
        site_url: "https://fixture-02.local",
      }),
    )
  })

  it("counts only fixture-marked accounts", async () => {
    getAllAccountsMock.mockResolvedValue([
      realAccount,
      { id: "fixture-1", notes: `${DEV_FIXTURE_NOTES_MARKER} healthy` },
    ])

    await expect(countDevFixtureAccounts()).resolves.toBe(1)
  })

  it("clears only fixture-marked accounts", async () => {
    getAllAccountsMock.mockResolvedValue([
      realAccount,
      { id: "fixture-1", notes: `${DEV_FIXTURE_NOTES_MARKER} healthy` },
      { id: "fixture-2", notes: `${DEV_FIXTURE_NOTES_MARKER} disabled` },
    ])
    deleteAccountsMock.mockResolvedValue({
      deletedCount: 2,
      deletedIds: ["fixture-1", "fixture-2"],
    })

    await expect(clearDevFixtureAccounts()).resolves.toBe(2)
    expect(deleteAccountsMock).toHaveBeenCalledWith(["fixture-1", "fixture-2"])
  })

  it("clears nothing when no fixture accounts exist", async () => {
    await expect(clearDevFixtureAccounts()).resolves.toBe(0)
    expect(deleteAccountsMock).not.toHaveBeenCalled()
  })
})
