import { afterEach, describe, expect, it, vi } from "vitest"

import {
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/compatibilityConfig"
import {
  getSelectedCheckInStatus,
  isAutomaticCheckInConfiguredForAccount,
  resolveSelectedCheckInMethod,
} from "~/services/checkin/autoCheckin/inspection"
import {
  executeSelectedCheckIn,
  markSelectedCheckInExecuted,
} from "~/services/checkin/autoCheckin/methods"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import { getLegacyAutoCheckinMethodIds } from "~/services/checkin/autoCheckin/providers/registry"
import { refreshSelectedStatus } from "~/services/checkin/autoCheckin/refresh"
import {
  mergeCompatibilityCheckInStatus,
  mergeRefreshedCheckInStatus,
  mergeUserOwnedCheckInDraft,
} from "~/services/checkin/autoCheckin/state"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

describe("check-in methods compatibility activation", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("turns a pre-registry support result into canonical evidence and selection", () => {
    const config = createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.NEW_API,
      supported: true,
      automaticExecutionEnabled: true,
    })

    expect(
      resolveSelectedCheckInMethod({ config, siteType: SITE_TYPES.NEW_API }),
    ).toBe("new-api:daily-checkin")
    expect(
      config.methodKnowledge.methods["new-api:daily-checkin"]?.detection,
    ).toEqual({
      outcome: "matched",
      evidence: { source: "compatibility_registration" },
    })
  })

  it("does not invent support for a new Sub2API account and keeps execution off", () => {
    const config = createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.SUB2API,
      supported: false,
      automaticExecutionEnabled: false,
    })

    expect(config).toMatchObject({
      automaticExecutionEnabled: false,
      methodKnowledge: { methods: {} },
      selection: { mode: "automatic" as const },
    })
    expect(config.selection).not.toHaveProperty("methodId")
  })

  it.each([
    {
      name: "selected enabled account",
      supported: true,
      automaticExecutionEnabled: true,
      accountDisabled: false,
      expected: true,
    },
    {
      name: "account without a selection",
      supported: false,
      automaticExecutionEnabled: true,
      accountDisabled: false,
      expected: false,
    },
    {
      name: "account without automatic intent",
      supported: true,
      automaticExecutionEnabled: false,
      accountDisabled: false,
      expected: false,
    },
    {
      name: "disabled account",
      supported: true,
      automaticExecutionEnabled: true,
      accountDisabled: true,
      expected: false,
    },
  ])("derives automatic check-in setup once: $name", (testCase) => {
    const config = createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.NEW_API,
      supported: testCase.supported,
      automaticExecutionEnabled: testCase.automaticExecutionEnabled,
    })

    expect(
      isAutomaticCheckInConfiguredForAccount({
        config,
        siteType: SITE_TYPES.NEW_API,
        accountDisabled: testCase.accountDisabled,
      }),
    ).toBe(testCase.expected)
  })

  it("stores a compatibility status only on the selected method", () => {
    const config = createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.VELOERA,
      supported: true,
      automaticExecutionEnabled: true,
    })
    const updated = mergeCompatibilityCheckInStatus({
      config,
      methodId: "veloera:daily-checkin",
      isCheckedInToday: true,
      observedAt: 123,
    })

    expect(
      getSelectedCheckInStatus({
        config: updated,
        siteType: SITE_TYPES.VELOERA,
      }),
    ).toEqual({
      outcome: "known",
      today: "checked",
      evidence: { source: "probe", observedAt: 123 },
    })
  })
  it("records a successful selected method with execution evidence", () => {
    const config = createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.NEW_API,
      supported: true,
      automaticExecutionEnabled: true,
    })
    const originalSnapshot = structuredClone(config)
    const updated = markSelectedCheckInExecuted({
      config,
      siteType: SITE_TYPES.NEW_API,
      observedAt: 456,
    })

    expect(
      getSelectedCheckInStatus({
        config: updated,
        siteType: SITE_TYPES.NEW_API,
      }),
    ).toEqual({
      outcome: "known",
      today: "checked",
      evidence: { source: "execution", observedAt: 456 },
    })
    expect(config).toEqual(originalSnapshot)
    expect(updated).not.toBe(config)
  })

  it("preserves known method availability when refreshing boolean daily status", () => {
    const config = createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.NEW_API,
      supported: true,
      automaticExecutionEnabled: true,
    })
    config.methodKnowledge.methods["new-api:daily-checkin"]!.status = {
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      availability: "disabled",
      today: CHECK_IN_METHOD_TODAY_STATUSES.Checked,
      evidence: { source: "probe", observedAt: 100 },
    }

    const updated = mergeCompatibilityCheckInStatus({
      config,
      methodId: "new-api:daily-checkin",
      isCheckedInToday: false,
      observedAt: 200,
    })

    expect(
      updated.methodKnowledge.methods["new-api:daily-checkin"]?.status,
    ).toMatchObject({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      availability: "disabled",
      today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
      evidence: { source: "probe", observedAt: 200 },
    })
  })

  it("refreshes only the selected method from a canonical account", async () => {
    const config = createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.WONG_GONGYI,
      supported: true,
      automaticExecutionEnabled: false,
    })
    const seenMethodIds: string[] = []

    const updated = await refreshSelectedStatus({
      config,
      siteType: SITE_TYPES.WONG_GONGYI,
      observedAt: 654,
      readStatus: async (methodId) => {
        seenMethodIds.push(methodId)
        return false
      },
    })

    expect(seenMethodIds).toEqual(["wong-gongyi:daily-checkin"])
    expect(
      updated.methodKnowledge.methods["wong-gongyi:daily-checkin"]?.status,
    ).toEqual({
      outcome: "known",
      today: "not_checked",
      evidence: { source: "probe", observedAt: 654 },
    })
  })

  it("merges user-owned draft fields without overwriting newer system facts", () => {
    const original = createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.NEW_API,
      supported: true,
      automaticExecutionEnabled: true,
      customCheckIn: {
        url: "https://old.example.invalid/check-in",
        isCheckedInToday: false,
      },
    })
    const latest = markSelectedCheckInExecuted({
      config: original,
      siteType: SITE_TYPES.NEW_API,
      observedAt: 789,
    })
    latest.customCheckIn = {
      ...latest.customCheckIn,
      isCheckedInToday: true,
      lastCheckInDate: "2026-08-10",
    }
    const draft = {
      ...original,
      automaticExecutionEnabled: false,
      customCheckIn: {
        ...original.customCheckIn,
        url: "https://new.example.invalid/check-in",
      },
    }

    const merged = mergeUserOwnedCheckInDraft({ latest, draft })

    expect(merged.automaticExecutionEnabled).toBe(false)
    expect(merged.selection).toEqual(latest.selection)
    expect(merged.methodKnowledge).toEqual(latest.methodKnowledge)
    expect(merged.customCheckIn).toEqual({
      url: "https://new.example.invalid/check-in",
      isCheckedInToday: true,
      lastCheckInDate: "2026-08-10",
      redeemUrl: undefined,
      openRedeemWithCheckIn: undefined,
      turnstilePreTrigger: undefined,
    })
  })

  it("merges refreshed status without rolling back newer user fields", () => {
    const opened = createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.NEW_API,
      supported: true,
      automaticExecutionEnabled: true,
    })
    const refreshed = markSelectedCheckInExecuted({
      config: opened,
      siteType: SITE_TYPES.NEW_API,
      observedAt: 987,
    })
    const latest = {
      ...opened,
      automaticExecutionEnabled: false,
      customCheckIn: { url: "https://latest.example.invalid/check-in" },
    }

    const merged = mergeRefreshedCheckInStatus({ latest, refreshed })

    expect(merged.automaticExecutionEnabled).toBe(false)
    expect(merged.customCheckIn).toEqual(latest.customCheckIn)
    expect(
      getSelectedCheckInStatus({
        config: merged,
        siteType: SITE_TYPES.NEW_API,
      }),
    ).toMatchObject({
      today: "checked",
      evidence: { source: "execution", observedAt: 987 },
    })
  })

  it.each([
    {
      siteType: SITE_TYPES.NEW_API,
      missingTokenReady: false,
      cookieWithoutTokenReady: true,
      missingUserReady: false,
      missingAuthTypeWithoutTokenReady: false,
    },
    {
      siteType: SITE_TYPES.VELOERA,
      missingTokenReady: false,
      cookieWithoutTokenReady: true,
      missingUserReady: false,
      missingAuthTypeWithoutTokenReady: true,
    },
    {
      siteType: SITE_TYPES.WONG_GONGYI,
      missingTokenReady: false,
      cookieWithoutTokenReady: true,
      missingUserReady: false,
      missingAuthTypeWithoutTokenReady: false,
    },
    {
      siteType: SITE_TYPES.ANYROUTER,
      missingTokenReady: true,
      cookieWithoutTokenReady: true,
      missingUserReady: false,
      missingAuthTypeWithoutTokenReady: true,
    },
    {
      siteType: SITE_TYPES.VO_API_V2,
      missingTokenReady: false,
      cookieWithoutTokenReady: false,
      missingUserReady: true,
      missingAuthTypeWithoutTokenReady: false,
    },
  ])(
    "preserves V6 runnable and auth parity for $siteType",
    async ({
      siteType,
      missingTokenReady,
      cookieWithoutTokenReady,
      missingUserReady,
      missingAuthTypeWithoutTokenReady,
    }) => {
      const methodId = getLegacyAutoCheckinMethodIds(siteType)[0]
      const registration = methodId
        ? autoCheckinMethodRegistry.resolveById(methodId)
        : null
      expect(registration).toBeDefined()
      if (!registration) throw new Error(`Missing registration for ${siteType}`)

      const cases = [
        {
          name: "valid access-token account",
          automaticExecutionEnabled: true,
          disabled: false,
          authType: AuthTypeEnum.AccessToken,
          userId: "7",
          accessToken: "test-token",
          providerReady: true,
        },
        {
          name: "missing access token",
          automaticExecutionEnabled: true,
          disabled: false,
          authType: AuthTypeEnum.AccessToken,
          userId: "7",
          accessToken: "",
          providerReady: missingTokenReady,
        },
        {
          name: "cookie auth without token",
          automaticExecutionEnabled: true,
          disabled: false,
          authType: AuthTypeEnum.Cookie,
          userId: "7",
          accessToken: "",
          providerReady: cookieWithoutTokenReady,
        },
        {
          name: "missing user id",
          automaticExecutionEnabled: true,
          disabled: false,
          authType: AuthTypeEnum.AccessToken,
          userId: "",
          accessToken: "test-token",
          providerReady: missingUserReady,
        },
        {
          name: "legacy missing auth type without token",
          automaticExecutionEnabled: true,
          disabled: false,
          authType: undefined,
          userId: "7",
          accessToken: "",
          providerReady: missingAuthTypeWithoutTokenReady,
        },
        {
          name: "account disabled",
          automaticExecutionEnabled: true,
          disabled: true,
          authType: AuthTypeEnum.AccessToken,
          userId: "7",
          accessToken: "test-token",
          providerReady: true,
        },
        {
          name: "automatic execution disabled",
          automaticExecutionEnabled: false,
          disabled: false,
          authType: AuthTypeEnum.AccessToken,
          userId: "7",
          accessToken: "test-token",
          providerReady: true,
        },
      ] as const

      for (const testCase of cases) {
        const baseAccount = buildSiteAccount()
        const account = buildSiteAccount({
          site_type: siteType,
          disabled: testCase.disabled,
          authType: testCase.authType,
          account_info: {
            ...baseAccount.account_info,
            id: testCase.userId,
            access_token: testCase.accessToken,
          },
          checkIn: createCompatibilityCheckInConfig({
            siteType,
            supported: true,
            automaticExecutionEnabled: testCase.automaticExecutionEnabled,
          }),
        })
        expect(registration.provider.canCheckIn(account), testCase.name).toBe(
          testCase.providerReady,
        )

        const checkIn = vi
          .spyOn(registration.provider, "checkIn")
          .mockResolvedValue({ status: "success" })
        const result = await executeSelectedCheckIn({
          account,
          globalAutomaticExecutionEnabled: true,
          context: {
            tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
            protectionBypassExecution: userCommandExecution(
              PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
            ),
          },
        })
        const preMigrationRunnable =
          !testCase.disabled &&
          testCase.automaticExecutionEnabled &&
          testCase.providerReady

        expect(result.kind === "executed", testCase.name).toBe(
          preMigrationRunnable,
        )
        expect(checkIn, testCase.name).toHaveBeenCalledTimes(
          preMigrationRunnable ? 1 : 0,
        )
        checkIn.mockRestore()
      }
    },
  )
})
