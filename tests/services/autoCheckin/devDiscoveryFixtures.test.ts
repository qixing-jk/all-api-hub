import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Mock } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import {
  addDevCheckInFixtureAccounts,
  clearDevFixtureAccounts,
} from "~/features/DevPanel/fixtureAccounts"
import { accountCheckInState } from "~/services/accounts/accountStorage/accountCheckInState"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import {
  discoverAccountCheckInMethods,
  redetectSavedAccountCheckIn,
} from "~/services/checkin/autoCheckin/accountDiscovery"
import { buildAutoCheckinAccountSnapshot } from "~/services/checkin/autoCheckin/accountSnapshot"
import { appendDevCheckInFixtureSnapshots } from "~/services/checkin/autoCheckin/devDiscoveryFixtures"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import type { AutoCheckinProvider } from "~/services/checkin/autoCheckin/providers/contracts"
import { STORAGE_KEYS } from "~/services/core/storageKeys"

const { data } = vi.hoisted(() => ({ data: new Map<string, unknown>() }))
vi.mock("@plasmohq/storage", () => ({
  Storage: class {
    get = vi.fn(async (key: string) => structuredClone(data.get(key)))
    set = vi.fn(async (key: string, value: unknown) => {
      data.set(key, structuredClone(value))
    })
    remove = vi.fn(async (key: string) => {
      data.delete(key)
    })
    watch = vi.fn()
  },
}))

describe("local check-in discovery fixtures", () => {
  const detectors: Mock<NonNullable<AutoCheckinProvider["detect"]>>[] = []
  beforeEach(() => {
    data.clear()
    vi.stubEnv("DEV", true)
    for (const { provider } of autoCheckinMethodRegistry.getCandidates(
      SITE_TYPES.SUB2API,
    )) {
      if (provider.detect)
        detectors.push(
          vi
            .spyOn(provider, "detect")
            .mockRejectedValue(new Error("Real probe must not run")),
        )
    }
  })
  afterEach(() => {
    detectors.length = 0
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it("seeds a repeatable multi-method account and uses real guarded selection persistence", async () => {
    expect(await addDevCheckInFixtureAccounts()).toBe(5)
    const account = (await accountQueries.getAllAccounts()).find(
      (a) => a.site_name === "Dev Check-in: Multiple methods",
    )!
    expect(account.checkIn.automaticExecutionEnabled).toBe(false)
    const result = await redetectSavedAccountCheckIn(account.id, {})
    expect(result).toMatchObject({
      applied: true,
      requiresSelection: true,
      discovery: { decision: { outcome: "ambiguous" } },
    })
    expect(result!.discovery.decision).toMatchObject({
      methodIds: [
        AUTO_CHECKIN_METHOD_IDS.Sub2ApiProDailyCheckIn,
        AUTO_CHECKIN_METHOD_IDS.GeniusProgrammerDailyCheckIn,
      ],
    })
    expect(
      (
        await accountCheckInState.selectDetectedCheckInMethod(
          result!.account,
          AUTO_CHECKIN_METHOD_IDS.GeniusProgrammerDailyCheckIn,
        )
      )?.applied,
    ).toBe(true)
    expect(await redetectSavedAccountCheckIn(account.id, {})).toMatchObject({
      requiresSelection: false,
      account: {
        checkIn: {
          selection: {
            mode: "manual",
            methodId: AUTO_CHECKIN_METHOD_IDS.GeniusProgrammerDailyCheckIn,
          },
        },
      },
    })
    expect(detectors.every((d) => d.mock.calls.length === 0)).toBe(true)
    await clearDevFixtureAccounts()
    expect(await accountQueries.getAllAccounts()).toEqual([])
  })

  it("covers a sole method, a preserved manual choice, unknown and unsupported detection", async () => {
    await addDevCheckInFixtureAccounts()
    for (const [label, outcome, requiresSelection] of [
      ["Single method", "resolved", false],
      ["Manual choice", "ambiguous", false],
      ["Detection failed", "unknown", false],
      ["Unsupported", "unsupported", false],
    ] as const) {
      const account = (await accountQueries.getAllAccounts()).find(
        (a) => a.site_name === `Dev Check-in: ${label}`,
      )!
      expect(await redetectSavedAccountCheckIn(account.id, {})).toMatchObject({
        applied: true,
        requiresSelection,
        discovery: { decision: { outcome } },
      })
    }
    expect(detectors.every((d) => d.mock.calls.length === 0)).toBe(true)
  })

  it("never simulates production builds, unregistered accounts or changed identities", async () => {
    await addDevCheckInFixtureAccounts()
    const account = (await accountQueries.getAllAccounts())[0]!
    for (const altered of [
      { ...account, id: "unregistered" },
      { ...account, site_url: "https://real.example.com" },
      {
        ...account,
        account_info: { ...account.account_info, access_token: "real-token" },
      },
    ]) {
      vi.clearAllMocks()
      await discoverAccountCheckInMethods(altered, {})
      expect(detectors.some((d) => d.mock.calls.length > 0)).toBe(true)
    }
    vi.stubEnv("DEV", false)
    vi.clearAllMocks()
    await discoverAccountCheckInMethods(account, {})
    expect(detectors.some((d) => d.mock.calls.length > 0)).toBe(true)
    expect(data.get(STORAGE_KEYS.DEV_FIXTURE_ACCOUNT_IDS)).toHaveLength(5)
    expect(await addDevCheckInFixtureAccounts()).toBe(0)
  })

  it("shows fixtures in readiness without executing a check-in or changing history", async () => {
    await addDevCheckInFixtureAccounts()
    const accounts = await accountQueries.getAllAccounts()
    const previous = [
      {
        ...buildAutoCheckinAccountSnapshot(accounts[0]!, "History"),
        accountId: "history",
      },
    ]
    const snapshots = await appendDevCheckInFixtureSnapshots(previous, accounts)
    expect(snapshots).toHaveLength(6)
    expect(snapshots[0]).toBe(previous[0])
    expect(
      snapshots.slice(1).every((s) => !s.autoCheckinEnabled && !s.lastResult),
    ).toBe(true)
    expect(
      await appendDevCheckInFixtureSnapshots(snapshots, accounts),
    ).toHaveLength(6)
    vi.stubEnv("DEV", false)
    expect(await appendDevCheckInFixtureSnapshots(previous, accounts)).toBe(
      previous,
    )
  })

  it.each([undefined, ["not-a-fixture", 42]])(
    "rejects missing or malformed registration (%j)",
    async (registry) => {
      await addDevCheckInFixtureAccounts()
      const accounts = await accountQueries.getAllAccounts()
      data.set(STORAGE_KEYS.DEV_FIXTURE_ACCOUNT_IDS, registry)
      expect(await appendDevCheckInFixtureSnapshots([], accounts)).toEqual([])
      await discoverAccountCheckInMethods(accounts[0]!, {})
      expect(detectors.some((d) => d.mock.calls.length > 0)).toBe(true)
    },
  )
})
