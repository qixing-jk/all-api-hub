import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { accountCheckInState } from "~/services/accounts/accountStorage/accountCheckInState"
import { accountConfigStore } from "~/services/accounts/accountStorage/accountConfigStore"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import {
  createDefaultAccountStorageConfig,
  createPersistedSiteAccount,
} from "~/services/accounts/editing/accountDefaults"
import { redetectSavedAccountCheckIn } from "~/services/checkin/autoCheckin/discovery/accountDiscovery"
import { discoverSavedAccountCheckIn } from "~/services/checkin/autoCheckin/discovery/postSaveDiscovery"
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
  detectors: [vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()],
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
        AUTO_CHECKIN_METHOD_IDS.ToolcodeDailyCheckIn,
        AUTO_CHECKIN_METHOD_IDS.HiyoDailyCheckIn,
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
  it("retires a pending choice when the account is deleted", async () => {
    saveAccount()
    atIndex(detectors, 1).mockResolvedValue(detection("matched"))
    const result = await redetectSavedAccountCheckIn("account", context)
    storageData.set(
      ACCOUNT_STORAGE_KEYS.ACCOUNTS,
      createDefaultAccountStorageConfig(NOW),
    )
    expect(
      await accountCheckInState.selectDetectedCheckInMethod(
        result!.account,
        GENIUS,
      ),
    ).toBeNull()
  })

  it.each(["selection", "newer discovery", "disabled", "unmatched method"])(
    "rejects a pending method choice after %s",
    async (change) => {
      saveAccount()
      atIndex(detectors, 1).mockResolvedValue(detection("matched"))
      const result = await redetectSavedAccountCheckIn("account", context)
      await updateAccount((account) => {
        if (change === "disabled") return { ...account, disabled: true }
        if (change === "selection")
          return {
            ...account,
            checkIn: {
              ...account.checkIn,
              selection: { mode: "manual", methodId: PRO },
            },
          }
        if (change === "newer discovery")
          return {
            ...account,
            checkIn: {
              ...account.checkIn,
              methodKnowledge: {
                ...account.checkIn.methodKnowledge,
                lastFullDiscoveryAt: NOW + 10,
              },
            },
          }
        return {
          ...account,
          checkIn: {
            ...account.checkIn,
            methodKnowledge: {
              ...account.checkIn.methodKnowledge,
              methods: {
                ...account.checkIn.methodKnowledge.methods,
                [GENIUS]: { detection: detection("unsupported") },
              },
            },
          },
        }
      })
      const selected = await accountCheckInState.selectDetectedCheckInMethod(
        result!.account,
        GENIUS,
      )
      expect(selected?.applied).toBe(false)
      expect(selected?.account.checkIn.selection.methodId).not.toBe(GENIUS)
    },
  )

  it("preserves unrelated settings edited while a method choice is open", async () => {
    saveAccount()
    atIndex(detectors, 1).mockResolvedValue(detection("matched"))
    const result = await redetectSavedAccountCheckIn("account", context)
    await updateAccount((account) => ({
      ...account,
      notes: "new note",
      checkIn: { ...account.checkIn, automaticExecutionEnabled: false },
    }))
    const selected = await accountCheckInState.selectDetectedCheckInMethod(
      result!.account,
      GENIUS,
    )
    expect(selected?.applied).toBe(true)
    expect(selected?.account.notes).toBe("new note")
    expect(selected?.account.checkIn.automaticExecutionEnabled).toBe(false)
  })

  it("does not save an explicitly cancelled detection", async () => {
    saveAccount()
    const controller = new AbortController()
    atIndex(detectors, 0).mockImplementationOnce(async () => {
      controller.abort()
      return detection("matched")
    })
    const result = await redetectSavedAccountCheckIn("account", {
      ...context,
      signal: controller.signal,
    })
    expect(result).toBeNull()
    expect(storageSet).not.toHaveBeenCalled()
  })

  it("adopts a sole matched replacement when the prior manual method is unsupported", async () => {
    const account = createAccount()
    account.checkIn.selection = { mode: "manual", methodId: GENIUS }
    saveAccount(account)
    const result = await redetectSavedAccountCheckIn(account.id, context)
    expect(result?.account.checkIn.selection.methodId).toBe(PRO)
    expect(result?.requiresSelection).toBe(false)
  })

  it("explicit redetection probes even after a completed discovery and keeps intent off", async () => {
    const account = createAccount()
    account.checkIn.automaticExecutionEnabled = false
    account.checkIn.methodKnowledge.lastFullDiscoveryAt = NOW
    saveAccount(account)
    const result = await redetectSavedAccountCheckIn(account.id, context)
    expect(result?.applied).toBe(true)
    expect(result?.account.checkIn.selection.methodId).toBe(PRO)
    expect(result?.account.checkIn.automaticExecutionEnabled).toBe(false)
    expect(
      result?.account.checkIn.methodKnowledge.lastFullDiscoveryAt,
    ).toBeGreaterThan(NOW)
    expect(checkIn).not.toHaveBeenCalled()
  })

  it("returns a choice for multiple matches and persists only the chosen method", async () => {
    saveAccount()
    atIndex(detectors, 1).mockResolvedValue(detection("matched"))
    const result = await redetectSavedAccountCheckIn("account", context)
    expect(result?.requiresSelection).toBe(true)
    expect(result?.account.checkIn.selection.methodId).toBeUndefined()
    const selected = await accountCheckInState.selectDetectedCheckInMethod(
      result!.account,
      GENIUS,
    )
    expect(selected?.applied).toBe(true)
    expect(selected?.account.checkIn.selection).toEqual({
      mode: "manual",
      methodId: GENIUS,
    })
    expect(checkIn).not.toHaveBeenCalled()
  })

  it("keeps an existing manual choice without asking again when multiple methods match", async () => {
    const account = createAccount()
    account.checkIn.selection = { mode: "manual", methodId: PRO }
    saveAccount(account)
    atIndex(detectors, 1).mockResolvedValue(detection("matched"))
    const result = await redetectSavedAccountCheckIn("account", context)
    expect(result?.requiresSelection).toBe(false)
    expect(result?.account.checkIn.selection).toEqual(account.checkIn.selection)
  })

  it("rejects a dialog choice when credentials change and preserves unrelated edits", async () => {
    saveAccount()
    atIndex(detectors, 1).mockResolvedValue(detection("matched"))
    const result = await redetectSavedAccountCheckIn("account", context)
    await updateAccount((account) => ({
      ...account,
      notes: "new note",
      account_info: { ...account.account_info, access_token: "rotated" },
    }))
    const selected = await accountCheckInState.selectDetectedCheckInMethod(
      result!.account,
      GENIUS,
    )
    expect(selected?.applied).toBe(false)
    expect(selected?.account.notes).toBe("new note")
    expect(selected?.account.checkIn.selection.methodId).toBeUndefined()
  })

  it("does not offer stale discovery results when the account changes during probing", async () => {
    saveAccount()
    atIndex(detectors, 0).mockImplementationOnce(async () => {
      await updateAccount((account) => ({
        ...account,
        account_info: { ...account.account_info, access_token: "rotated" },
      }))
      return detection("matched")
    })
    const result = await redetectSavedAccountCheckIn("account", context)
    expect(result?.applied).toBe(false)
    expect(result?.requiresSelection).toBe(false)
  })

  it("selects ToolCode after save without enabling automatic execution or posting", async () => {
    const account = createAccount()
    account.checkIn.automaticExecutionEnabled = false
    detectors.forEach((detect) =>
      detect.mockResolvedValue(detection("unsupported")),
    )
    atIndex(detectors, 4).mockResolvedValue(detection("matched"))
    const result = await discoverSavedAccountCheckIn(
      saveAccount(account),
      context,
    )
    expect(result?.checkIn.selection.methodId).toBe(
      AUTO_CHECKIN_METHOD_IDS.ToolcodeDailyCheckIn,
    )
    expect(result?.checkIn.automaticExecutionEnabled).toBe(false)
    expect(checkIn).not.toHaveBeenCalled()
  })

  it.each(["edited", "deleted"])(
    "returns the latest saved account after discovery completion fails (%s)",
    async (change) => {
      const account = saveAccount()
      const complete = vi
        .spyOn(accountCheckInState, "completeUserCheckInDiscovery")
        .mockImplementationOnce(async () => {
          if (change === "deleted") {
            storageData.set(
              ACCOUNT_STORAGE_KEYS.ACCOUNTS,
              createDefaultAccountStorageConfig(NOW),
            )
          } else {
            await updateAccount((latest) => ({
              ...latest,
              notes: "Edited during discovery",
              account_info: {
                ...latest.account_info,
                access_token: "replacement-token",
              },
            }))
          }
          throw new Error("discovery completion failed")
        })
      try {
        const result = await discoverSavedAccountCheckIn(account, context)
        if (change === "deleted") expect(result).toBeNull()
        else {
          expect(result?.notes).toBe("Edited during discovery")
          expect(result?.account_info.access_token).toBe("replacement-token")
          expect(result?.checkIn.selection.methodId).toBeUndefined()
        }
        expect(result).toEqual(await accountQueries.getAccountById(account.id))
        expect(checkIn).not.toHaveBeenCalled()
      } finally {
        complete.mockRestore()
      }
    },
  )

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
