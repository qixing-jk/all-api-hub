import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import {
  createDefaultAccountStorageConfig,
  createPersistedSiteAccount,
} from "~/services/accounts/accountDefaults"
import { accountConfigStore } from "~/services/accounts/accountStorage/accountConfigStore"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { discoverSavedAccountCheckIn } from "~/services/checkin/autoCheckin/postSaveDiscovery"
import { ACCOUNT_STORAGE_KEYS } from "~/services/core/storageKeys"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"
import type { CheckInMethodDetection } from "~/types/checkIn"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const { storageData, storageSet, detectors, checkIn } = vi.hoisted(() => ({
  storageData: new Map<string, unknown>(),
  storageSet: vi.fn(),
  detectors: [vi.fn(), vi.fn(), vi.fn(), vi.fn()],
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
        AUTO_CHECKIN_METHOD_IDS.XiaobaiCodeDailyCheckIn,
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
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
  protectionBypassExecution: userCommandExecution(
    PROTECTION_BYPASS_USER_COMMANDS.AddAccount,
    TEMP_WINDOW_REQUEST_SOURCES.Popup,
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

describe("post-save check-in discovery", () => {
  it.each(["disabled", "no candidates"])(
    "skips discovery for %s accounts",
    async (reason) => {
      const account = createAccount()
      if (reason === "disabled") account.disabled = true
      else account.site_type = SITE_TYPES.ONE_API
      saveAccount(account)
      await discoverSavedAccountCheckIn(account, context)
      detectors.forEach((detect) => expect(detect).not.toHaveBeenCalled())
    },
  )

  it("preserves a pinned method while discovering availability", async () => {
    const account = createAccount()
    account.checkIn.selection = { mode: "manual", methodId: GENIUS }
    saveAccount(account)
    const result = await discoverSavedAccountCheckIn(account, context)
    expect(result?.checkIn.selection).toEqual(account.checkIn.selection)
    expect(
      result?.checkIn.methodKnowledge.methods[PRO]?.detection.outcome,
    ).toBe("matched")
  })

  it("does not overwrite a newer completed discovery", async () => {
    const account = saveAccount()
    const started = createDeferred<void>()
    const response = createDeferred<CheckInMethodDetection>()
    atIndex(detectors, 0).mockImplementation(() => {
      started.resolve()
      return response.promise
    })
    const pending = discoverSavedAccountCheckIn(account, context)
    await started.promise
    await updateAccount((latest) => ({
      ...latest,
      checkIn: {
        ...latest.checkIn,
        methodKnowledge: {
          ...latest.checkIn.methodKnowledge,
          lastFullDiscoveryAt: NOW + 1,
        },
      },
    }))
    response.resolve(detection("matched"))
    await pending
    const latest = await accountQueries.getAccountById(account.id)
    expect(latest?.checkIn.methodKnowledge.lastFullDiscoveryAt).toBe(NOW + 1)
    expect(latest?.checkIn.selection.methodId).toBeUndefined()
  })

  it("discovers with the saved credential even when automatic execution is off", async () => {
    const account = createAccount()
    account.checkIn.automaticExecutionEnabled = false
    saveAccount(account)
    const result = await discoverSavedAccountCheckIn(account, context)
    expect(result?.checkIn.selection.methodId).toBe(PRO)
    expect(result?.checkIn.automaticExecutionEnabled).toBe(false)
    expect(atIndex(detectors, 0)).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          auth: expect.objectContaining({ accessToken: "test-token" }),
          tempWindowRequestSource: context.tempWindowRequestSource,
          protectionBypassExecution: context.protectionBypassExecution,
        }),
      }),
    )
    expect(checkIn).not.toHaveBeenCalled()
  })

  it("reuses a completed definitive discovery without another request", async () => {
    const account = saveAccount()
    const first = await discoverSavedAccountCheckIn(account, context)
    expect(first?.checkIn.selection.methodId).toBe(PRO)
    detectors.forEach((detect) => detect.mockClear())
    await discoverSavedAccountCheckIn(first!, context)
    detectors.forEach((detect) => expect(detect).not.toHaveBeenCalled())
  })

  it("retries a recent inconclusive probe without the daily scheduler cooldown", async () => {
    const account = saveAccount()
    detectors.forEach((detect) =>
      detect.mockRejectedValue(new Error("network failure")),
    )
    const failed = await discoverSavedAccountCheckIn(account, context)
    expect(failed?.checkIn.selection.methodId).toBeUndefined()
    expect(failed?.checkIn.methodKnowledge.lastFullDiscoveryAt).toBe(NOW)
    vi.setSystemTime(NOW + 1)
    detectors.forEach((detect, index) =>
      detect.mockResolvedValue(
        detection(index === 0 ? "matched" : "unsupported", NOW + 1),
      ),
    )
    const recovered = await discoverSavedAccountCheckIn(failed!, context)
    expect(recovered?.checkIn.selection.methodId).toBe(PRO)
  })

  it("retries an inconclusive discovery that retained older positive evidence", async () => {
    const account = saveAccount()
    const established = await discoverSavedAccountCheckIn(account, context)
    expect(established?.checkIn.selection.methodId).toBe(PRO)
    const inconclusive = await updateAccount((latest) => ({
      ...latest,
      checkIn: {
        ...latest.checkIn,
        methodKnowledge: {
          ...latest.checkIn.methodKnowledge,
          methods: {
            ...latest.checkIn.methodKnowledge.methods,
            [PRO]: {
              detection: {
                ...detection("matched"),
                lastUnknownAttempt: { reason: "timeout", attemptedAt: NOW },
              },
            },
          },
        },
      },
    }))
    detectors.forEach((detect) => detect.mockClear())
    await discoverSavedAccountCheckIn(inconclusive!, context)
    expect(atIndex(detectors, 0)).toHaveBeenCalledOnce()
  })

  it("lets a slow browser-assisted probe finish after the early-discovery budget", async () => {
    const account = saveAccount()
    const started = createDeferred<void>()
    atIndex(detectors, 0).mockImplementation(() => {
      started.resolve()
      return new Promise<CheckInMethodDetection>((resolve) => {
        setTimeout(() => resolve(detection("matched", NOW + 8_000)), 8_000)
      })
    })
    const pending = discoverSavedAccountCheckIn(account, context)
    await started.promise
    await vi.advanceTimersByTimeAsync(8_000)
    const result = await pending
    expect(result?.checkIn.selection.methodId).toBe(PRO)
  })

  it("gives discovery its own bounded window after a slow account refresh", async () => {
    vi.setSystemTime(NOW + 10_000)
    const account = saveAccount()
    const started = createDeferred<void>()
    atIndex(detectors, 0).mockImplementation(() => {
      started.resolve()
      return new Promise(() => {})
    })
    const pending = discoverSavedAccountCheckIn(account, context)
    await started.promise
    await vi.advanceTimersByTimeAsync(60_001)
    const result = await pending
    expect(
      result?.checkIn.methodKnowledge.methods[PRO]?.detection,
    ).toMatchObject({
      outcome: "unknown",
      reason: "timeout",
    })
    expect(await accountQueries.getAccountById(account.id)).not.toBeNull()
  })

  it.each(["credentials", "site", "identity", "selection", "deletion"])(
    "discards an in-flight result after %s changes",
    async (change) => {
      const account = saveAccount()
      const started = createDeferred<void>()
      const response = createDeferred<CheckInMethodDetection>()
      atIndex(detectors, 0).mockImplementation(() => {
        started.resolve()
        return response.promise
      })
      const pending = discoverSavedAccountCheckIn(account, context)
      await started.promise
      if (change === "deletion") {
        storageData.set(
          ACCOUNT_STORAGE_KEYS.ACCOUNTS,
          createDefaultAccountStorageConfig(NOW),
        )
      } else {
        await updateAccount((latest) => ({
          ...latest,
          ...(change === "site" ? { site_url: "https://another.example" } : {}),
          account_info: {
            ...latest.account_info,
            ...(change === "credentials"
              ? { access_token: "replacement" }
              : {}),
            ...(change === "identity" ? { id: "another-user" } : {}),
          },
          ...(change === "selection"
            ? {
                checkIn: {
                  ...latest.checkIn,
                  selection: { mode: "manual", methodId: GENIUS },
                },
              }
            : {}),
        }))
      }
      response.resolve(detection("matched"))
      await pending
      const latest = await accountQueries.getAccountById(account.id)
      expect(
        latest?.checkIn.methodKnowledge.lastFullDiscoveryAt,
      ).toBeUndefined()
      if (change === "selection")
        expect(latest?.checkIn.selection.methodId).toBe(GENIUS)
    },
  )

  it("preserves concurrent user settings while merging discovery facts", async () => {
    const account = saveAccount()
    const started = createDeferred<void>()
    const response = createDeferred<CheckInMethodDetection>()
    atIndex(detectors, 0).mockImplementation(() => {
      started.resolve()
      return response.promise
    })
    const pending = discoverSavedAccountCheckIn(account, context)
    await started.promise
    await updateAccount((latest) => ({
      ...latest,
      notes: "edited",
      checkIn: {
        ...latest.checkIn,
        automaticExecutionEnabled: false,
        customCheckIn: {
          url: "https://custom.example",
          openRedeemWithCheckIn: true,
        },
      },
    }))
    response.resolve(detection("matched"))
    const result = await pending
    expect(result?.notes).toBe("edited")
    expect(result?.checkIn.automaticExecutionEnabled).toBe(false)
    expect(result?.checkIn.customCheckIn?.url).toBe("https://custom.example")
    expect(result?.checkIn.selection.methodId).toBe(PRO)
  })
})
