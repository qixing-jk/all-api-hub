import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_CHECKIN_METHOD_IDS,
  AUTOMATIC_CHECK_IN_DISCOVERY_COOLDOWN_MS,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import {
  createDefaultAccountStorageConfig,
  createPersistedSiteAccount,
} from "~/services/accounts/accountDefaults"
import { accountCheckInState } from "~/services/accounts/accountStorage/accountCheckInState"
import { accountConfigStore } from "~/services/accounts/accountStorage/accountConfigStore"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { prepareAutomaticCheckIn } from "~/services/checkin/autoCheckin/automaticDiscovery"
import { discoverCheckInMethods } from "~/services/checkin/autoCheckin/discovery"
import type { AutoCheckinProviderReadContext } from "~/services/checkin/autoCheckin/providers/contracts"
import { ACCOUNT_STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
} from "~/services/protectionBypass/contracts"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"
import type { CheckInMethodDetection } from "~/types/checkIn"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { automaticExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { createDeferred } from "~~/tests/test-utils/deferred"

const { storageData, storageSet, detectors, checkIn } = vi.hoisted(() => ({
  storageData: new Map<string, unknown>(),
  storageSet: vi.fn(),
  detectors: [vi.fn(), vi.fn(), vi.fn()],
  checkIn: vi.fn(),
}))

vi.mock("@plasmohq/storage", () => ({
  Storage: class {
    get = vi.fn(async (key: string) => structuredClone(storageData.get(key)))
    set = storageSet
    remove = vi.fn(async (key: string) => {
      storageData.delete(key)
    })
    watch = vi.fn()
  },
}))

vi.mock("~/services/checkin/autoCheckin/providers", async () => {
  const { AUTO_CHECKIN_METHOD_IDS } = await import("~/constants/checkIn")
  const { SITE_TYPES } = await import("~/constants/siteType")
  const { createAutoCheckinMethodRegistry } = await import(
    "~/services/checkin/autoCheckin/providers/registry"
  )
  return {
    autoCheckinMethodRegistry: createAutoCheckinMethodRegistry(
      [
        AUTO_CHECKIN_METHOD_IDS.Sub2ApiProDailyCheckIn,
        AUTO_CHECKIN_METHOD_IDS.GeniusProgrammerDailyCheckIn,
        AUTO_CHECKIN_METHOD_IDS.DenxioDailyCheckIn,
      ].map((id, index) => ({
        id,
        siteTypes: [SITE_TYPES.SUB2API],
        provider: {
          getReadiness: () => ({ ready: true as const }),
          detect: detectors[index],
          checkIn,
        },
      })),
    ),
  }
})

const NOW = new Date("2026-09-15T01:00:00Z").getTime()
const PRO = AUTO_CHECKIN_METHOD_IDS.Sub2ApiProDailyCheckIn
const GENIUS = AUTO_CHECKIN_METHOD_IDS.GeniusProgrammerDailyCheckIn
const context = {
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
  protectionBypassExecution: automaticExecution(
    PROTECTION_BYPASS_FEATURES.Checkin,
    PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
  ),
}

const detection = (
  outcome: "matched" | "unsupported",
  observedAt = NOW,
): CheckInMethodDetection => ({
  outcome,
  evidence: { source: "probe", observedAt },
})

const createAccount = () =>
  createPersistedSiteAccount({
    id: "account",
    now: NOW - 1_000,
    account: {
      site_name: "Test site",
      site_url: "https://checkin.example",
      site_type: SITE_TYPES.SUB2API,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        id: "user-1",
        access_token: "test-token",
        username: "test-user",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
      checkIn: buildCheckInConfig({ automaticExecutionEnabled: true }),
      exchange_rate: 1,
      health: { status: SiteHealthStatus.Unknown },
      last_sync_time: 0,
      notes: "Keep this note",
      tagIds: [],
      disabled: false,
      excludeFromTotalBalance: false,
      excludeFromTodayIncome: false,
    },
  })

const saveAccount = (account = createAccount()) => {
  storageData.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, {
    ...createDefaultAccountStorageConfig(NOW),
    accounts: [account],
  })
  return account
}

const updateAccount = (update: (account: SiteAccount) => SiteAccount) =>
  accountConfigStore.mutateAccount("account", (account) => {
    const nextAccount = update(account)
    return { nextAccount, result: nextAccount, changed: true }
  })

const prepare = (
  account: SiteAccount,
  isAutomaticExecutionEnabled = vi.fn(async () => true),
) => prepareAutomaticCheckIn({ account, context, isAutomaticExecutionEnabled })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  storageData.clear()
  storageSet
    .mockReset()
    .mockImplementation(async (key: string, value: unknown) => {
      storageData.set(key, structuredClone(value))
    })
  detectors.forEach((detect, index) => {
    detect
      .mockReset()
      .mockResolvedValue(detection(index === 0 ? "matched" : "unsupported"))
  })
  checkIn.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("automatic check-in preparation", () => {
  it("reserves the cooldown before bounded reads, saves a unique choice, and never checks in", async () => {
    const account = saveAccount()
    detectors[0].mockImplementation(
      async (read: AutoCheckinProviderReadContext) => {
        const saved = await accountQueries.getAccountById(account.id)
        expect(
          saved?.checkIn.methodKnowledge.lastAutomaticDiscoveryAttemptAt,
        ).toBe(NOW)
        expect(read.request).toMatchObject({
          accountId: account.id,
          baseUrl: account.site_url,
          auth: {
            authType: account.authType,
            userId: "user-1",
            accessToken: "test-token",
          },
          ...context,
        })
        expect(read.signal).toBeInstanceOf(AbortSignal)
        return detection("matched")
      },
    )

    const prepared = await prepare(account)
    const saved = await accountQueries.getAccountById(account.id)

    expect(prepared).toMatchObject({
      discovered: true,
      account: { checkIn: { selection: { mode: "automatic", methodId: PRO } } },
    })
    expect(saved?.checkIn.methodKnowledge).toMatchObject({
      lastAutomaticDiscoveryAttemptAt: NOW,
      lastFullDiscoveryAt: NOW,
    })
    expect(saved?.notes).toBe(account.notes)
    expect(saved?.user_updated_at).toBe(account.user_updated_at)
    expect(checkIn).not.toHaveBeenCalled()
  })

  it.each(["automatic", "manual"] as const)(
    "keeps a %s choice when it is still matched",
    async (mode) => {
      const account = createAccount()
      account.checkIn.selection = { mode, methodId: PRO }
      account.checkIn.methodKnowledge.methods[PRO] = {
        detection: detection("matched"),
      }
      saveAccount(account)

      expect(await prepare(account)).toMatchObject({ discovered: false })
      expect(detectors[0]).not.toHaveBeenCalled()
      expect(storageSet).not.toHaveBeenCalled()
    },
  )

  it("replaces an explicitly unsupported automatic choice with a unique alternative", async () => {
    const account = createAccount()
    account.checkIn.selection = { mode: "automatic", methodId: PRO }
    account.checkIn.methodKnowledge.methods[PRO] = {
      detection: detection("unsupported", NOW - 1_000),
    }
    saveAccount(account)
    detectors[0].mockResolvedValue(detection("unsupported"))
    detectors[1].mockResolvedValue(detection("matched"))

    await prepare(account)

    expect(
      (await accountQueries.getAccountById(account.id))?.checkIn.selection,
    ).toEqual({ mode: "automatic", methodId: GENIUS })
    expect(checkIn).not.toHaveBeenCalled()
  })

  it.each([
    { name: "multiple matches", second: detection("matched") },
    {
      name: "a remaining unknown candidate",
      second: {
        outcome: "unknown",
        reason: "network",
        attemptedAt: NOW,
      } as CheckInMethodDetection,
    },
  ])("does not invent a unique choice with $name", async ({ second }) => {
    const account = saveAccount()
    detectors[1].mockResolvedValue(second)

    await prepare(account)

    expect(
      (await accountQueries.getAccountById(account.id))?.checkIn.selection,
    ).toEqual({ mode: "automatic" })
    expect(checkIn).not.toHaveBeenCalled()
  })

  it("claims overlapping runs once and retains the cooldown across worker reloads", async () => {
    const account = saveAccount()
    detectors.forEach((detect) =>
      detect.mockResolvedValue(detection("unsupported")),
    )

    await Promise.all([prepare(account), prepare(account)])
    expect(detectors[0]).toHaveBeenCalledTimes(1)

    vi.resetModules()
    const restarted = await import(
      "~/services/checkin/autoCheckin/automaticDiscovery"
    )
    await restarted.prepareAutomaticCheckIn({
      account,
      context,
      isAutomaticExecutionEnabled: async () => true,
    })
    expect(detectors[0]).toHaveBeenCalledTimes(1)

    vi.setSystemTime(NOW + AUTOMATIC_CHECK_IN_DISCOVERY_COOLDOWN_MS)
    await restarted.prepareAutomaticCheckIn({
      account,
      context,
      isAutomaticExecutionEnabled: async () => true,
    })
    expect(detectors[0]).toHaveBeenCalledTimes(2)
  })

  it.each([
    {
      name: "manual selection",
      update: (account: SiteAccount) => ({
        ...account,
        checkIn: {
          ...account.checkIn,
          selection: { mode: "manual" as const, methodId: GENIUS },
        },
      }),
    },
    {
      name: "disabled automatic execution",
      update: (account: SiteAccount) => ({
        ...account,
        checkIn: { ...account.checkIn, automaticExecutionEnabled: false },
      }),
    },
    {
      name: "disabled account",
      update: (account: SiteAccount) => ({ ...account, disabled: true }),
    },
    {
      name: "changed user identity",
      update: (account: SiteAccount) => ({
        ...account,
        account_info: { ...account.account_info, id: "user-2" },
      }),
    },
    {
      name: "changed site URL",
      update: (account: SiteAccount) => ({
        ...account,
        site_url: "https://another.example",
      }),
    },
    {
      name: "replaced credentials",
      update: (account: SiteAccount) => ({
        ...account,
        account_info: { ...account.account_info, access_token: "replacement" },
      }),
    },
  ])("does not apply stale detection after $name", async ({ update }) => {
    const account = saveAccount()
    const started = createDeferred<void>()
    const response = createDeferred<CheckInMethodDetection>()
    detectors[0].mockImplementation(() => {
      started.resolve()
      return response.promise
    })
    const pending = prepare(account)
    await started.promise
    const latest = await updateAccount(update)
    response.resolve(detection("matched"))

    await pending

    const saved = await accountQueries.getAccountById(account.id)
    expect(saved?.checkIn.selection).toEqual(latest.checkIn.selection)
    expect(saved?.checkIn.automaticExecutionEnabled).toBe(
      latest.checkIn.automaticExecutionEnabled,
    )
    expect(saved?.checkIn.methodKnowledge.lastFullDiscoveryAt).toBeUndefined()
    expect(saved?.site_url).toBe(latest.site_url)
    expect(saved?.account_info.id).toBe(latest.account_info.id)
    expect(checkIn).not.toHaveBeenCalled()
  })

  it("keeps newer discovery, user fields, and status instead of restoring a stale snapshot", async () => {
    const account = saveAccount()
    const started = createDeferred<void>()
    const response = createDeferred<CheckInMethodDetection>()
    detectors[0].mockImplementation(() => {
      started.resolve()
      return response.promise
    })
    const pending = prepare(account)
    await started.promise
    await updateAccount((current) => ({
      ...current,
      notes: "Changed during discovery",
      checkIn: {
        ...current.checkIn,
        customCheckIn: { url: "https://external.example/checkin" },
        methodKnowledge: {
          ...current.checkIn.methodKnowledge,
          lastFullDiscoveryAt: NOW + 1,
          methods: { [PRO]: { detection: detection("unsupported", NOW + 1) } },
        },
      },
    }))
    response.resolve(detection("matched"))

    await pending

    expect(await accountQueries.getAccountById(account.id)).toMatchObject({
      notes: "Changed during discovery",
      checkIn: {
        customCheckIn: { url: "https://external.example/checkin" },
        selection: { mode: "automatic" },
        methodKnowledge: {
          lastAutomaticDiscoveryAttemptAt: NOW,
          lastFullDiscoveryAt: NOW + 1,
          methods: { [PRO]: { detection: { outcome: "unsupported" } } },
        },
      },
    })
  })

  it("does not probe when automation is disabled while the cooldown claim is pending", async () => {
    const account = saveAccount()
    let enabled = true
    const started = createDeferred<void>()
    const release = createDeferred<void>()
    storageSet.mockImplementationOnce(async (key: string, value: unknown) => {
      started.resolve()
      await release.promise
      storageData.set(key, structuredClone(value))
    })

    const pending = prepare(
      account,
      vi.fn(async () => enabled),
    )
    await started.promise
    enabled = false
    release.resolve()

    const prepared = await pending
    expect(prepared.discovered).toBe(false)
    expect(prepared.account?.checkIn.selection).toEqual({ mode: "automatic" })
    expect(
      prepared.account?.checkIn.methodKnowledge.lastAutomaticDiscoveryAttemptAt,
    ).toBe(NOW)
    expect(
      (await accountQueries.getAccountById(account.id))?.checkIn
        .methodKnowledge,
    ).toMatchObject({
      lastAutomaticDiscoveryAttemptAt: NOW,
    })
    detectors.forEach((detect) => expect(detect).not.toHaveBeenCalled())
    expect(checkIn).not.toHaveBeenCalled()
  })

  it("does not commit an automatic choice after the global switch is disabled", async () => {
    const account = saveAccount()
    let enabled = true
    const isEnabled = vi.fn(async () => enabled)
    detectors[0].mockImplementation(async () => {
      enabled = false
      return detection("matched")
    })

    const prepared = await prepare(account, isEnabled)

    expect(prepared.discovered).toBe(false)
    expect(
      (await accountQueries.getAccountById(account.id))?.checkIn.selection,
    ).toEqual({ mode: "automatic" })
  })

  it.each([
    "account disabled",
    "automation disabled",
    "manual choice",
    "credentials changed",
  ])(
    "does not probe a stale claim when %s during the global setting read",
    async (change) => {
      const account = saveAccount()
      const started = createDeferred<void>()
      const release = createDeferred<void>()
      const isEnabled = vi
        .fn(async () => {
          started.resolve()
          await release.promise
          return true
        })
        .mockResolvedValueOnce(true)
      const pending = prepare(account, isEnabled)
      await started.promise
      const latest = await updateAccount((current) => {
        if (change === "account disabled") return { ...current, disabled: true }
        if (change === "automation disabled")
          return {
            ...current,
            checkIn: { ...current.checkIn, automaticExecutionEnabled: false },
          }
        if (change === "manual choice")
          return {
            ...current,
            checkIn: {
              ...current.checkIn,
              selection: { mode: "manual", methodId: GENIUS },
            },
          }
        return {
          ...current,
          account_info: {
            ...current.account_info,
            access_token: "replacement",
          },
        }
      })
      release.resolve()

      expect(await pending).toEqual({ account: latest, discovered: false })
      detectors.forEach((detect) => expect(detect).not.toHaveBeenCalled())
      expect(checkIn).not.toHaveBeenCalled()
    },
  )

  it("does not probe an account deleted during the global setting read", async () => {
    const account = saveAccount()
    const isEnabled = vi
      .fn(async () => {
        storageData.set(
          ACCOUNT_STORAGE_KEYS.ACCOUNTS,
          createDefaultAccountStorageConfig(NOW),
        )
        return true
      })
      .mockResolvedValueOnce(true)

    expect(await prepare(account, isEnabled)).toEqual({
      account: null,
      discovered: false,
    })
    detectors.forEach((detect) => expect(detect).not.toHaveBeenCalled())
    expect(checkIn).not.toHaveBeenCalled()
  })

  it.each(["before claim", "before probes", "after probes"])(
    "fails closed when reading global preferences throws %s",
    async (stage) => {
      const account = saveAccount()
      const isEnabled = vi.fn(async () => true)
      if (stage !== "before claim") isEnabled.mockResolvedValueOnce(true)
      if (stage === "after probes") isEnabled.mockResolvedValueOnce(true)
      isEnabled.mockRejectedValue(new Error("preferences unavailable"))

      expect(await prepare(account, isEnabled)).toEqual({
        account: null,
        discovered: false,
      })
      const saved = await accountQueries.getAccountById(account.id)
      expect(saved?.checkIn.selection).toEqual({ mode: "automatic" })
      expect(saved?.checkIn.methodKnowledge.lastFullDiscoveryAt).toBeUndefined()
      expect(checkIn).not.toHaveBeenCalled()
      if (stage !== "after probes") {
        detectors.forEach((detect) => expect(detect).not.toHaveBeenCalled())
      }
    },
  )

  it("rejects stale selected-method status before writing it to a changed account", async () => {
    const account = createAccount()
    account.checkIn.selection = { mode: "automatic", methodId: PRO }
    account.checkIn.methodKnowledge.methods[PRO] = {
      detection: detection("matched"),
    }
    saveAccount(account)
    await updateAccount((current) => ({
      ...current,
      account_info: { ...current.account_info, id: "replacement-user" },
    }))
    const refreshed = structuredClone(account.checkIn)
    refreshed.methodKnowledge.methods[PRO]!.status = {
      outcome: "known",
      today: "checked",
      evidence: { source: "probe", observedAt: NOW },
    }

    expect(
      await accountCheckInState.prepareAccountForSelectedCheckIn(
        account.id,
        refreshed,
        account,
      ),
    ).toBeNull()
    expect(
      (await accountQueries.getAccountById(account.id))?.checkIn.methodKnowledge
        .methods[PRO]?.status,
    ).toBeUndefined()
  })

  it.each(["reservation", "completion"] as const)(
    "fails closed on a %s storage failure",
    async (stage) => {
      const account = saveAccount()
      if (stage === "reservation") {
        storageSet.mockRejectedValueOnce(new Error("storage unavailable"))
      } else {
        detectors[0].mockImplementation(async () => {
          storageSet.mockRejectedValueOnce(new Error("storage unavailable"))
          return detection("matched")
        })
      }

      expect((await prepare(account)).account).toBeNull()
      expect(checkIn).not.toHaveBeenCalled()
      if (stage === "reservation") expect(detectors[0]).not.toHaveBeenCalled()
      expect(
        (await accountQueries.getAccountById(account.id))?.checkIn.selection
          .methodId,
      ).toBeUndefined()
    },
  )

  it("persists cooldown after a timed-out read and still allows explicit rediscovery", async () => {
    const account = saveAccount()
    detectors[0].mockImplementation(() => new Promise(() => {}))
    const pending = prepare(account)
    await vi.advanceTimersByTimeAsync(3_000)
    await pending
    const saved = (await accountQueries.getAccountById(account.id))!
    expect(saved.checkIn.methodKnowledge.lastAutomaticDiscoveryAttemptAt).toBe(
      NOW,
    )
    expect(saved.checkIn.selection.methodId).toBeUndefined()
    await prepare(saved)
    expect(detectors[0]).toHaveBeenCalledTimes(1)

    detectors[0].mockResolvedValue(detection("matched"))
    const manual = await discoverCheckInMethods({
      account: saved,
      config: saved.checkIn,
    })
    expect(manual.config.selection.methodId).toBe(PRO)
    expect(detectors[0]).toHaveBeenCalledTimes(2)
    expect(checkIn).not.toHaveBeenCalled()
  })
})
