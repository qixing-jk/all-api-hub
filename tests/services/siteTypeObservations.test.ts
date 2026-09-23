import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { siteTypeObservations } from "~/services/siteDetection/siteTypeObservations"

const { storageState } = vi.hoisted(() => ({
  storageState: {
    value: undefined as unknown,
    fail: false,
    setCalls: 0,
  },
}))

vi.mock("@plasmohq/storage", () => ({
  Storage: class {
    async get() {
      if (storageState.fail) throw new Error("storage unavailable")
      return storageState.value
    }
    async set(_key: string, value: unknown) {
      storageState.setCalls += 1
      if (storageState.fail) throw new Error("storage unavailable")
      storageState.value = value
    }
  },
}))

const MISMATCH = {
  storedSiteType: SITE_TYPES.NEW_API,
  suggestedSiteType: SITE_TYPES.VELOERA,
}
const OBSERVATION = { ...MISMATCH, at: 10 }

describe("site type observation store", () => {
  beforeEach(() => {
    storageState.value = undefined
    storageState.fail = false
    storageState.setCalls = 0
  })

  it("reports nothing before anything was recorded", async () => {
    await expect(
      siteTypeObservations.readForAccount("account-1", SITE_TYPES.NEW_API),
    ).resolves.toBeNull()
    await expect(
      siteTypeObservations.readForAccounts([
        { id: "account-1", siteType: SITE_TYPES.NEW_API },
      ]),
    ).resolves.toEqual({})
  })

  it("records one observation per account and reads it back", async () => {
    await siteTypeObservations.record({
      accountId: "account-1",
      mismatch: MISMATCH,
      at: 10,
    })

    expect(storageState.value).toEqual({ "account-1": OBSERVATION })
    await expect(
      siteTypeObservations.readForAccount("account-1", SITE_TYPES.NEW_API),
    ).resolves.toEqual(MISMATCH)
  })

  it("reports an observation only while its account still carries the recorded type", async () => {
    await siteTypeObservations.record({
      accountId: "account-1",
      mismatch: MISMATCH,
    })
    await siteTypeObservations.record({
      accountId: "account-2",
      mismatch: {
        storedSiteType: SITE_TYPES.ONE_API,
        suggestedSiteType: SITE_TYPES.NEW_API,
      },
    })

    await expect(
      siteTypeObservations.readForAccount("account-1", SITE_TYPES.VELOERA),
    ).resolves.toBeNull()
    await expect(
      siteTypeObservations.readForAccounts([
        { id: "account-1", siteType: SITE_TYPES.NEW_API },
        { id: "account-2", siteType: SITE_TYPES.VELOERA },
        { id: "account-3", siteType: SITE_TYPES.NEW_API },
      ]),
    ).resolves.toEqual({ "account-1": MISMATCH })
  })

  it("defaults the observation time to now", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_700_000_000_000)

    try {
      await siteTypeObservations.record({
        accountId: "account-1",
        mismatch: MISMATCH,
      })

      await expect(
        siteTypeObservations.readForAccount("account-1", SITE_TYPES.NEW_API),
      ).resolves.toEqual(MISMATCH)
      expect(storageState.value).toEqual({
        "account-1": { ...MISMATCH, at: 1_700_000_000_000 },
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("replaces the previous observation for the same account", async () => {
    await siteTypeObservations.record({
      accountId: "account-1",
      mismatch: MISMATCH,
    })
    await siteTypeObservations.record({
      accountId: "account-1",
      mismatch: {
        storedSiteType: SITE_TYPES.NEW_API,
        suggestedSiteType: SITE_TYPES.ONE_HUB,
      },
      at: 20,
    })

    expect(storageState.value).toEqual({
      "account-1": {
        storedSiteType: SITE_TYPES.NEW_API,
        suggestedSiteType: SITE_TYPES.ONE_HUB,
        at: 20,
      },
    })
  })

  it("drops entries written in an unknown shape", async () => {
    storageState.value = {
      "account-1": {
        storedSiteType: "not-a-type",
        suggestedSiteType: "x",
        at: 1,
      },
      "account-2": { storedSiteType: SITE_TYPES.NEW_API, at: 1 },
      "account-3": { ...OBSERVATION, at: "later" },
      "account-4": OBSERVATION,
    }

    await expect(
      siteTypeObservations.readForAccounts(
        ["account-1", "account-2", "account-3", "account-4"].map((id) => ({
          id,
          siteType: SITE_TYPES.NEW_API,
        })),
      ),
    ).resolves.toEqual({ "account-4": MISMATCH })
  })

  it("does not write when it could not read the current observations", async () => {
    storageState.value = { "account-2": OBSERVATION }
    storageState.fail = true

    await siteTypeObservations.record({
      accountId: "account-1",
      mismatch: MISMATCH,
    })

    expect(storageState.setCalls).toBe(0)
  })

  it("reports nothing when the stored observations cannot be read", async () => {
    storageState.fail = true

    await expect(
      siteTypeObservations.readForAccount("account-1", SITE_TYPES.NEW_API),
    ).resolves.toBeNull()
    await expect(
      siteTypeObservations.readForAccounts([
        { id: "account-1", siteType: SITE_TYPES.NEW_API },
      ]),
    ).resolves.toEqual({})
  })

  it("never rejects the caller when storage fails", async () => {
    storageState.fail = true

    await expect(
      siteTypeObservations.record({
        accountId: "account-1",
        mismatch: MISMATCH,
      }),
    ).resolves.toBeUndefined()
  })
})
