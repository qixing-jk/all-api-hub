// Install shared mocks before loading scheduler dependencies.
import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_LOGIN_PROVIDERS } from "~/constants/accountLogin"
import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import {
  mockedAccountStorage,
  mockedLoginProviderEvidence,
  mockedMethods,
  mockedUserPreferences,
  resolveProviderForTest,
  runCheckinsForTest,
  schedulerTestState,
} from "~~/tests/services/autoCheckin/schedulerTestHarness"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

describe("AgentRouter login provider claims", () => {
  const agentRouterAccount = (
    id: string,
    provider: "github" | "linuxdo" = ACCOUNT_LOGIN_PROVIDERS.Github,
  ) => ({
    id,
    site_name: `AgentRouter ${id}`,
    site_type: SITE_TYPES.NEW_API,
    site_url: "https://agentrouter.org",
    account_info: { id: "17", username: id },
    disabled: false,
    checkIn: buildCheckInConfig({
      automaticExecutionEnabled: true,
      loginCheckIn: { provider },
      selection: {
        mode: "automatic",
        methodId: AUTO_CHECKIN_METHOD_IDS.AgentRouterLoginCheckIn,
      },
      methodKnowledge: {
        methods: {
          [AUTO_CHECKIN_METHOD_IDS.AgentRouterLoginCheckIn]: {
            detection: {
              outcome: "matched",
              evidence: { source: "probe", observedAt: 100 },
            },
          },
        },
      },
    }),
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: { ...DEFAULT_PREFERENCES.autoCheckin, globalEnabled: true },
    })
    mockedAccountStorage.markAccountAsSiteCheckedIn.mockResolvedValue(true)
    mockedAccountStorage.refreshAccount.mockResolvedValue({ refreshed: false })
    resolveProviderForTest.mockReturnValue({
      getReadiness: () => ({ ready: true }),
      checkIn: vi.fn(async () => ({ status: "success" })),
    })
  })

  it("runs only the owner when two accounts claim the same login provider", async () => {
    const owner = agentRouterAccount("a")
    const duplicate = agentRouterAccount("b")
    mockedAccountStorage.getAllAccounts.mockResolvedValue([owner, duplicate])

    await runCheckinsForTest({})

    expect(mockedMethods.executeSelectedCheckIn).toHaveBeenCalledTimes(1)
    expect(
      atIndex(mockedMethods.executeSelectedCheckIn.mock.calls, 0)[0].account.id,
    ).toBe("a")
    expect(schedulerTestState.storedStatus.perAccount.a).toMatchObject({
      status: "success",
    })
    expect(schedulerTestState.storedStatus.perAccount.b).toMatchObject({
      status: "skipped",
      messageKey: "autoCheckin:skipReasons.login_provider_in_use",
      reasonCode: "login_provider_in_use",
    })
    // The duplicate is blocked in the snapshot like every other
    // eligibility-restricted account, so readiness shows unavailable too.
    const snapshotById = Object.fromEntries(
      schedulerTestState.storedStatus.accountsSnapshot.map((snapshot: any) => [
        snapshot.accountId,
        snapshot,
      ]),
    )
    expect(snapshotById.a.skipReason).toBeUndefined()
    expect(snapshotById.b).toMatchObject({
      providerAvailable: false,
      skipReason: "login_provider_in_use",
    })
  })

  it("lets each provider run its own account", async () => {
    const github = agentRouterAccount("a", ACCOUNT_LOGIN_PROVIDERS.Github)
    const linuxdo = agentRouterAccount("b", ACCOUNT_LOGIN_PROVIDERS.LinuxDo)
    mockedAccountStorage.getAllAccounts.mockResolvedValue([github, linuxdo])

    await runCheckinsForTest({})

    expect(mockedMethods.executeSelectedCheckIn).toHaveBeenCalledTimes(2)
    expect(schedulerTestState.storedStatus.perAccount.a).toMatchObject({
      status: "success",
    })
    expect(schedulerTestState.storedStatus.perAccount.b).toMatchObject({
      status: "success",
    })
  })

  it("runs the account whose browser identity the last login proved", async () => {
    const rejected = agentRouterAccount("a")
    const proven = agentRouterAccount("b")
    mockedAccountStorage.getAllAccounts.mockResolvedValue([rejected, proven])
    mockedLoginProviderEvidence.readAll.mockResolvedValue({
      a: {
        provider: ACCOUNT_LOGIN_PROVIDERS.Github,
        outcome: "identity_mismatch",
        at: 1,
      },
    })

    await runCheckinsForTest({})

    expect(
      atIndex(mockedMethods.executeSelectedCheckIn.mock.calls, 0)[0].account.id,
    ).toBe("b")
  })

  it("keeps a duplicate runnable when the owner is disabled", async () => {
    const owner = agentRouterAccount("a")
    owner.disabled = true
    const fallback = agentRouterAccount("b")
    mockedAccountStorage.getAllAccounts.mockResolvedValue([owner, fallback])

    await runCheckinsForTest({})

    expect(
      atIndex(mockedMethods.executeSelectedCheckIn.mock.calls, 0)[0].account.id,
    ).toBe("b")
  })

  it("skips a duplicate even when only that account is targeted", async () => {
    const owner = agentRouterAccount("a")
    const duplicate = agentRouterAccount("b")
    mockedAccountStorage.getAllAccounts.mockResolvedValue([owner, duplicate])

    await runCheckinsForTest({ targetAccountIds: ["b"] })

    // The snapshot-level guard keeps the duplicate out of execution even when
    // it is the run's only target.
    expect(mockedMethods.executeSelectedCheckIn).not.toHaveBeenCalled()
    expect(schedulerTestState.storedStatus.perAccount.b).toMatchObject({
      status: "skipped",
      reasonCode: "login_provider_in_use",
    })
  })
})
