import { act, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  DATA_TYPE_BALANCE,
  DATA_TYPE_CASHFLOW,
  DATA_TYPE_CONSUMPTION,
  DATA_TYPE_INCOME,
} from "~/constants"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { VELOERA } from "~/constants/siteType"
import {
  UserPreferencesProvider,
  useUserPreferencesContext,
} from "~/contexts/UserPreferencesContext"
import {
  DEFAULT_REDEMPTION_ASSIST_PREFERENCES,
  DEFAULT_WEB_AI_API_CHECK_PREFERENCES,
} from "~/services/preferences/contentScriptFeatureDefaults"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import { DEFAULT_SORTING_PRIORITY_CONFIG } from "~/services/preferences/utils/sortingPriority"
import { DEFAULT_AXON_HUB_CONFIG } from "~/types/axonHubConfig"
import { DEFAULT_BALANCE_HISTORY_PREFERENCES } from "~/types/dailyBalanceHistory"
import { DEFAULT_DONE_HUB_CONFIG } from "~/types/doneHubConfig"
import { DEFAULT_OCTOPUS_CONFIG } from "~/types/octopusConfig"
import { SortingCriteriaType } from "~/types/sorting"
import { deepOverride } from "~/utils"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import {
  createPersistedPreferencesFixture,
  setupMockPreferencePersistence,
} from "~~/tests/test-utils/mockPreferencePersistence"

const { loggerMocks } = vi.hoisted(() => ({
  loggerMocks: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => loggerMocks,
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()

  return {
    ...actual,
    sendRuntimeMessage: vi.fn(),
  }
})

vi.mock("~/services/preferences/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/preferences/userPreferences")
    >()

  return {
    ...actual,
    userPreferences: {
      ...actual.userPreferences,
      getPreferences: vi.fn(),
      savePreferences: vi.fn(),
      savePreferencesWithResult: vi.fn(),
      updateActiveTab: vi.fn(),
      updateCurrencyType: vi.fn(),
      updateSortConfig: vi.fn(),
      setSortingPriorityConfig: vi.fn(),
      updateOpenChangelogOnUpdate: vi.fn(),
      updateAutoProvisionKeyOnAccountAdd: vi.fn(),
      updateAutoFillCurrentSiteUrlOnAccountAdd: vi.fn(),
      updateWarnOnDuplicateAccountAdd: vi.fn(),
      updateManagedSiteType: vi.fn(),
      updateLoggingPreferences: vi.fn(),
      resetToDefaults: vi.fn(),
      resetDisplaySettings: vi.fn(),
      resetAutoRefreshConfig: vi.fn(),
      resetNewApiConfig: vi.fn(),
      resetDoneHubConfig: vi.fn(),
      resetVeloeraConfig: vi.fn(),
      resetOctopusConfig: vi.fn(),
      resetAxonHubConfig: vi.fn(),
      resetClaudeCodeHubConfig: vi.fn(),
      resetNewApiModelSyncConfig: vi.fn(),
      resetCliProxyConfig: vi.fn(),
      resetClaudeCodeRouterConfig: vi.fn(),
      resetAutoCheckinConfig: vi.fn(),
      resetRedemptionAssist: vi.fn(),
      resetWebAiApiCheck: vi.fn(),
      resetModelRedirectConfig: vi.fn(),
      resetWebdavConfig: vi.fn(),
      resetSortingPriorityConfig: vi.fn(),
    },
  }
})

const mockedUserPreferences = userPreferences as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>
const mockedSendRuntimeMessage = sendRuntimeMessage as unknown as ReturnType<
  typeof vi.fn
>

let latestContext: ReturnType<typeof useUserPreferencesContext> | null = null

const clonePreferences = (): UserPreferences =>
  createPersistedPreferencesFixture()

let preferencePersistence = setupMockPreferencePersistence(
  mockedUserPreferences as any,
)

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

const Probe = ({ children }: { children?: ReactNode }) => {
  const context = useUserPreferencesContext()
  latestContext = context

  return (
    <div>
      <div data-testid="active-tab">{context.activeTab}</div>
      <div data-testid="sort-field">{context.sortField}</div>
      <div data-testid="currency-type">{context.currencyType}</div>
      <div data-testid="managed-site-type">{context.managedSiteType}</div>
      <div data-testid="loading-state">{String(context.isLoading)}</div>
      {children}
    </div>
  )
}

const renderProvider = async (
  preferences: UserPreferences = clonePreferences(),
) => {
  preferencePersistence.setPersistedPreferences(preferences)

  render(
    <UserPreferencesProvider>
      <Probe />
    </UserPreferencesProvider>,
  )

  await waitFor(() => {
    expect(screen.getByTestId("loading-state")).toHaveTextContent("false")
  })

  return latestContext as ReturnType<typeof useUserPreferencesContext>
}

describe("UserPreferencesContext", () => {
  beforeEach(() => {
    latestContext = null
    vi.clearAllMocks()

    preferencePersistence = setupMockPreferencePersistence(
      mockedUserPreferences as any,
      clonePreferences(),
    )
    const applyPersistedUpdate = (
      updates: Partial<UserPreferences> | Record<string, unknown>,
    ) => {
      const nextPreferences = deepOverride(
        preferencePersistence.getPersistedPreferences(),
        updates,
      )
      nextPreferences.lastUpdated += 1
      preferencePersistence.setPersistedPreferences(nextPreferences)
      return true
    }
    mockedUserPreferences.updateActiveTab.mockImplementation(
      async (activeTab) => applyPersistedUpdate({ activeTab }),
    )
    mockedUserPreferences.updateCurrencyType.mockImplementation(
      async (currencyType) => applyPersistedUpdate({ currencyType }),
    )
    mockedUserPreferences.updateSortConfig.mockImplementation(
      async (sortField, sortOrder) =>
        applyPersistedUpdate({ sortField, sortOrder }),
    )
    mockedUserPreferences.setSortingPriorityConfig.mockImplementation(
      async (sortingPriorityConfig) =>
        applyPersistedUpdate({ sortingPriorityConfig }),
    )
    mockedUserPreferences.updateOpenChangelogOnUpdate.mockImplementation(
      async (openChangelogOnUpdate) =>
        applyPersistedUpdate({ openChangelogOnUpdate }),
    )
    mockedUserPreferences.updateAutoProvisionKeyOnAccountAdd.mockImplementation(
      async (autoProvisionKeyOnAccountAdd) =>
        applyPersistedUpdate({ autoProvisionKeyOnAccountAdd }),
    )
    mockedUserPreferences.updateAutoFillCurrentSiteUrlOnAccountAdd.mockImplementation(
      async (autoFillCurrentSiteUrlOnAccountAdd) =>
        applyPersistedUpdate({ autoFillCurrentSiteUrlOnAccountAdd }),
    )
    mockedUserPreferences.updateWarnOnDuplicateAccountAdd.mockImplementation(
      async (warnOnDuplicateAccountAdd) =>
        applyPersistedUpdate({ warnOnDuplicateAccountAdd }),
    )
    mockedUserPreferences.updateManagedSiteType.mockImplementation(
      async (managedSiteType) => applyPersistedUpdate({ managedSiteType }),
    )
    mockedUserPreferences.updateLoggingPreferences.mockImplementation(
      async (updates) => applyPersistedUpdate({ logging: updates }),
    )
    mockedUserPreferences.resetToDefaults.mockResolvedValue(true)
    mockedUserPreferences.resetDisplaySettings.mockImplementation(async () =>
      applyPersistedUpdate({
        activeTab: DEFAULT_PREFERENCES.activeTab,
        currencyType: DEFAULT_PREFERENCES.currencyType,
        showTodayCashflow: DEFAULT_PREFERENCES.showTodayCashflow,
        sortField: DEFAULT_PREFERENCES.sortField,
        sortOrder: DEFAULT_PREFERENCES.sortOrder,
      }),
    )
    mockedUserPreferences.resetAutoRefreshConfig.mockImplementation(async () =>
      applyPersistedUpdate({
        accountAutoRefresh: DEFAULT_PREFERENCES.accountAutoRefresh,
      }),
    )
    mockedUserPreferences.resetNewApiConfig.mockImplementation(async () =>
      applyPersistedUpdate({
        newApi: DEFAULT_PREFERENCES.newApi,
      }),
    )
    mockedUserPreferences.resetDoneHubConfig.mockImplementation(async () =>
      applyPersistedUpdate({
        doneHub: DEFAULT_DONE_HUB_CONFIG,
      }),
    )
    mockedUserPreferences.resetVeloeraConfig.mockImplementation(async () =>
      applyPersistedUpdate({
        veloera: DEFAULT_PREFERENCES.veloera,
      }),
    )
    mockedUserPreferences.resetOctopusConfig.mockImplementation(async () =>
      applyPersistedUpdate({
        octopus: DEFAULT_PREFERENCES.octopus,
      }),
    )
    mockedUserPreferences.resetAxonHubConfig.mockImplementation(async () =>
      applyPersistedUpdate({
        axonHub: DEFAULT_AXON_HUB_CONFIG,
      }),
    )
    mockedUserPreferences.resetClaudeCodeHubConfig.mockImplementation(
      async () =>
        applyPersistedUpdate({
          claudeCodeHub: DEFAULT_PREFERENCES.claudeCodeHub,
        }),
    )
    mockedUserPreferences.resetNewApiModelSyncConfig.mockImplementation(
      async () =>
        applyPersistedUpdate({
          managedSiteModelSync: DEFAULT_PREFERENCES.managedSiteModelSync,
        }),
    )
    mockedUserPreferences.resetCliProxyConfig.mockImplementation(async () =>
      applyPersistedUpdate({
        cliProxy: DEFAULT_PREFERENCES.cliProxy,
      }),
    )
    mockedUserPreferences.resetClaudeCodeRouterConfig.mockImplementation(
      async () =>
        applyPersistedUpdate({
          claudeCodeRouter: DEFAULT_PREFERENCES.claudeCodeRouter,
        }),
    )
    mockedUserPreferences.resetAutoCheckinConfig.mockImplementation(async () =>
      applyPersistedUpdate({
        autoCheckin: DEFAULT_PREFERENCES.autoCheckin,
      }),
    )
    mockedUserPreferences.resetRedemptionAssist.mockImplementation(async () =>
      applyPersistedUpdate({
        redemptionAssist: DEFAULT_PREFERENCES.redemptionAssist,
      }),
    )
    mockedUserPreferences.resetWebAiApiCheck.mockImplementation(async () =>
      applyPersistedUpdate({
        webAiApiCheck: DEFAULT_PREFERENCES.webAiApiCheck,
      }),
    )
    mockedUserPreferences.resetModelRedirectConfig.mockImplementation(
      async () =>
        applyPersistedUpdate({
          modelRedirect: DEFAULT_PREFERENCES.modelRedirect,
        }),
    )
    mockedUserPreferences.resetWebdavConfig.mockImplementation(async () =>
      applyPersistedUpdate({
        webdav: DEFAULT_PREFERENCES.webdav,
      }),
    )
    mockedUserPreferences.resetSortingPriorityConfig.mockResolvedValue(true)
    mockedSendRuntimeMessage.mockResolvedValue(undefined)
  })

  it("throws when the hook is used without the provider", () => {
    const BrokenConsumer = () => {
      useUserPreferencesContext()
      return null
    }

    expect(() => render(<BrokenConsumer />)).toThrow(
      "useUserPreferencesContext 必须在 UserPreferencesProvider 中使用",
    )
  })

  it("loads preferences and normalizes hidden today-cashflow selections", async () => {
    const preferences = clonePreferences()
    preferences.showTodayCashflow = false
    preferences.activeTab = DATA_TYPE_CASHFLOW
    preferences.sortField = DATA_TYPE_CONSUMPTION

    await renderProvider(preferences)

    await waitFor(() => {
      expect(mockedUserPreferences.savePreferences).toHaveBeenCalledWith({
        activeTab: DATA_TYPE_BALANCE,
        sortField: DATA_TYPE_BALANCE,
      })
    })

    expect(screen.getByTestId("active-tab")).toHaveTextContent(
      DATA_TYPE_BALANCE,
    )
    expect(screen.getByTestId("sort-field")).toHaveTextContent(
      DATA_TYPE_BALANCE,
    )
    expect((latestContext as any)?.showTodayCashflow).toBe(false)
  })

  it("only normalizes the hidden sort field on load when the active tab is already visible", async () => {
    const preferences = clonePreferences()
    preferences.showTodayCashflow = false
    preferences.activeTab = DATA_TYPE_BALANCE
    preferences.sortField = DATA_TYPE_INCOME

    await renderProvider(preferences)

    await waitFor(() => {
      expect(mockedUserPreferences.savePreferences).toHaveBeenCalledWith({
        sortField: DATA_TYPE_BALANCE,
      })
    })

    expect(screen.getByTestId("active-tab")).toHaveTextContent(
      DATA_TYPE_BALANCE,
    )
    expect(screen.getByTestId("sort-field")).toHaveTextContent(
      DATA_TYPE_BALANCE,
    )
    expect((latestContext as any)?.showTodayCashflow).toBe(false)
  })

  it("updates scalar, nested, and runtime-backed preferences through the provider", async () => {
    const context = await renderProvider()

    await act(async () => {
      await context.updateActionClickBehavior("sidepanel")
      await context.updateCurrencyType("CNY")
      await context.updateSortConfig(DATA_TYPE_INCOME, "asc")
      await context.updateOpenChangelogOnUpdate(false)
      await context.updateAutoProvisionKeyOnAccountAdd(true)
      await context.updateAutoFillCurrentSiteUrlOnAccountAdd(true)
      await context.updateWarnOnDuplicateAccountAdd(false)
      await context.updateNewApiBaseUrl("https://new-api.example")
      await context.updateNewApiAdminToken("admin-token")
      await context.updateNewApiUserId("42")
      await context.updateNewApiUsername("alice")
      await context.updateNewApiPassword("secret")
      await context.updateNewApiTotpSecret("JBSWY3DPEHPK3PXP")
      await context.updateDoneHubBaseUrl("https://donehub.example")
      await context.updateDoneHubAdminToken("donehub-token")
      await context.updateDoneHubUserId("91")
      await context.updateVeloeraBaseUrl("https://veloera.example")
      await context.updateVeloeraAdminToken("veloera-token")
      await context.updateVeloeraUserId("77")
      await context.updateOctopusBaseUrl("https://octopus.example")
      await context.updateOctopusUsername("octopus-user")
      await context.updateOctopusPassword("octopus-pass")
      await context.updateAxonHubBaseUrl("https://axonhub.example")
      await context.updateAxonHubEmail("admin@example.com")
      await context.updateAxonHubPassword("axonhub-pass")
      await context.updateAxonHubConfig({
        baseUrl: "https://final-axonhub.example",
        email: "root@example.com",
        password: "final-password",
      })
      await context.updateClaudeCodeHubBaseUrl("https://cch.example")
      await context.updateClaudeCodeHubAdminToken("cch-token")
      await context.updateClaudeCodeHubConfig({
        baseUrl: "https://managed-cch.example",
        adminToken: "managed-cch-token",
      })
      await context.updateManagedSiteType(VELOERA)
      await context.updateThemeMode("dark")
      await context.updateLoggingConsoleEnabled(false)
      await context.updateLoggingLevel("warn")
      await context.updateAutoRefresh(true)
      await context.updateRefreshInterval(60_000)
      await context.updateMinRefreshInterval(15_000)
      await context.updateRefreshOnOpen(true)
      await context.updateAutoCheckin({
        globalEnabled: false,
        retryStrategy: {
          enabled: true,
          intervalMinutes: 15,
          maxAttemptsPerDay: 2,
        },
      })
      await context.updateBalanceHistory({
        enabled: true,
        retentionDays: 30,
        endOfDayCapture: { enabled: true },
      })
      await context.updateNewApiModelSync({
        enabled: false,
        allowedModels: ["gpt-4o"],
        rateLimit: { requestsPerMinute: 15, burst: 3 },
      })
      await context.updateModelRedirect({
        enabled: true,
      })
      await context.updateRedemptionAssist({
        enabled: false,
        contextMenu: { enabled: false },
      })
      await context.updateWebAiApiCheck({
        enabled: false,
        contextMenu: { enabled: false },
      })
      await context.updateTempWindowFallback({
        enabled: false,
        tempContextMode: "window",
      })
      await context.updateTempWindowFallbackReminder({
        dismissed: true,
      })
      await context.updateCliProxyBaseUrl("https://cli.example")
      await context.updateCliProxyManagementKey("cli-key")
      await context.updateClaudeCodeRouterBaseUrl("https://ccr.example")
      await context.updateClaudeCodeRouterApiKey("ccr-key")
    })

    expect(mockedUserPreferences.updateCurrencyType).toHaveBeenCalledWith("CNY")
    expect(mockedUserPreferences.updateSortConfig).toHaveBeenCalledWith(
      DATA_TYPE_INCOME,
      "asc",
    )
    expect(mockedUserPreferences.updateManagedSiteType).toHaveBeenCalledWith(
      VELOERA,
    )
    expect(mockedUserPreferences.updateLoggingPreferences).toHaveBeenCalledWith(
      {
        level: "warn",
      },
    )
    expect(
      mockedUserPreferences.savePreferencesWithResult,
    ).toHaveBeenCalledWith({
      newApi: { baseUrl: "https://new-api.example" },
    })
    expect(
      mockedUserPreferences.savePreferencesWithResult,
    ).toHaveBeenCalledWith({
      axonHub: { baseUrl: "https://axonhub.example" },
    })
    expect(
      mockedUserPreferences.savePreferencesWithResult,
    ).toHaveBeenCalledWith({
      axonHub: { email: "admin@example.com" },
    })
    expect(
      mockedUserPreferences.savePreferencesWithResult,
    ).toHaveBeenCalledWith({
      axonHub: { password: "axonhub-pass" },
    })
    expect(
      mockedUserPreferences.savePreferencesWithResult,
    ).toHaveBeenCalledWith({
      axonHub: {
        baseUrl: "https://final-axonhub.example",
        email: "root@example.com",
        password: "final-password",
      },
    })
    expect(
      mockedUserPreferences.savePreferencesWithResult,
    ).toHaveBeenCalledWith({
      claudeCodeHub: { baseUrl: "https://cch.example" },
    })
    expect(
      mockedUserPreferences.savePreferencesWithResult,
    ).toHaveBeenCalledWith({
      claudeCodeHub: { adminToken: "cch-token" },
    })
    expect(
      mockedUserPreferences.savePreferencesWithResult,
    ).toHaveBeenCalledWith({
      claudeCodeHub: {
        baseUrl: "https://managed-cch.example",
        adminToken: "managed-cch-token",
      },
    })
    expect(
      mockedUserPreferences.savePreferencesWithResult,
    ).toHaveBeenCalledWith(
      {
        managedSiteModelSync: {
          enabled: false,
          allowedModels: ["gpt-4o"],
          rateLimit: { requestsPerMinute: 15, burst: 3 },
        },
      },
      undefined,
    )

    expect((latestContext as any)?.currencyType).toBe("CNY")
    expect((latestContext as any)?.sortField).toBe(DATA_TYPE_INCOME)
    expect((latestContext as any)?.sortOrder).toBe("asc")
    expect((latestContext as any)?.actionClickBehavior).toBe("sidepanel")
    expect((latestContext as any)?.managedSiteType).toBe(VELOERA)
    expect((latestContext as any)?.themeMode).toBe("dark")
    expect((latestContext as any)?.preferences.newApi.baseUrl).toBe(
      "https://new-api.example",
    )
    expect((latestContext as any)?.preferences.doneHub.baseUrl).toBe(
      "https://donehub.example",
    )
    expect((latestContext as any)?.preferences.veloera.adminToken).toBe(
      "veloera-token",
    )
    expect((latestContext as any)?.preferences.octopus.username).toBe(
      "octopus-user",
    )
    expect((latestContext as any)?.preferences.axonHub).toEqual({
      baseUrl: "https://final-axonhub.example",
      email: "root@example.com",
      password: "final-password",
    })
    expect((latestContext as any)?.preferences.claudeCodeHub).toEqual({
      baseUrl: "https://managed-cch.example",
      adminToken: "managed-cch-token",
    })
    expect((latestContext as any)?.preferences.cliProxy.baseUrl).toBe(
      "https://cli.example",
    )
    expect((latestContext as any)?.preferences.claudeCodeRouter.apiKey).toBe(
      "ccr-key",
    )
    expect((latestContext as any)?.preferences.accountAutoRefresh.enabled).toBe(
      true,
    )
    expect((latestContext as any)?.preferences.autoCheckin.globalEnabled).toBe(
      false,
    )
    expect(
      (latestContext as any)?.preferences.balanceHistory.retentionDays,
    ).toBe(30)
    expect(
      (latestContext as any)?.preferences.managedSiteModelSync.rateLimit.burst,
    ).toBe(3)
    expect((latestContext as any)?.preferences.modelRedirect.enabled).toBe(true)
    expect((latestContext as any)?.preferences.redemptionAssist.enabled).toBe(
      false,
    )
    expect((latestContext as any)?.preferences.webAiApiCheck.enabled).toBe(
      false,
    )
    expect((latestContext as any)?.preferences.tempWindowFallback.enabled).toBe(
      false,
    )
    expect(
      (latestContext as any)?.preferences.tempWindowFallbackReminder.dismissed,
    ).toBe(true)

    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.PreferencesUpdateActionClickBehavior,
      behavior: "sidepanel",
    })
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.AutoRefreshUpdateSettings,
      settings: { accountAutoRefresh: { enabled: true } },
    })
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.AutoRefreshUpdateSettings,
      settings: { accountAutoRefresh: { interval: 60_000 } },
    })
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.AutoRefreshUpdateSettings,
      settings: { accountAutoRefresh: { minInterval: 15_000 } },
    })
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.AutoRefreshUpdateSettings,
      settings: { accountAutoRefresh: { refreshOnOpen: true } },
    })
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.AutoCheckinUpdateSettings,
      settings: {
        globalEnabled: false,
        retryStrategy: {
          enabled: true,
          intervalMinutes: 15,
          maxAttemptsPerDay: 2,
        },
      },
    })
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.BalanceHistoryUpdateSettings,
      settings: {
        enabled: true,
        retentionDays: 30,
        endOfDayCapture: { enabled: true },
      },
    })
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.ModelSyncUpdateSettings,
      settings: {
        enabled: false,
        allowedModels: ["gpt-4o"],
        rateLimit: { requestsPerMinute: 15, burst: 3 },
      },
    })
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.RedemptionAssistUpdateSettings,
      settings: {
        enabled: false,
        contextMenu: { enabled: false },
      },
    })
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.PreferencesRefreshContextMenus,
    })
  })

  it("persists active tab changes through both tab update helpers", async () => {
    const preferences = clonePreferences()
    preferences.activeTab = DATA_TYPE_BALANCE

    const context = await renderProvider(preferences)

    await act(async () => {
      expect(await context.updateActiveTab(DATA_TYPE_CASHFLOW)).toBe(true)
    })

    expect(mockedUserPreferences.updateActiveTab).toHaveBeenCalledWith(
      DATA_TYPE_CASHFLOW,
    )
    expect(screen.getByTestId("active-tab")).toHaveTextContent(
      DATA_TYPE_CASHFLOW,
    )
    expect((latestContext as any)?.preferences.activeTab).toBe(
      DATA_TYPE_CASHFLOW,
    )

    await act(async () => {
      expect(await context.updateDefaultTab(DATA_TYPE_BALANCE)).toBe(true)
    })

    expect(mockedUserPreferences.updateActiveTab).toHaveBeenLastCalledWith(
      DATA_TYPE_BALANCE,
    )
    expect(screen.getByTestId("active-tab")).toHaveTextContent(
      DATA_TYPE_BALANCE,
    )
    expect((latestContext as any)?.preferences.activeTab).toBe(
      DATA_TYPE_BALANCE,
    )
  })

  it("updates the sorting priority config in context when persistence succeeds", async () => {
    const context = await renderProvider()
    const updatedConfig = structuredClone(DEFAULT_SORTING_PRIORITY_CONFIG)

    updatedConfig.criteria = updatedConfig.criteria.map((criterion) => {
      if (criterion.id === SortingCriteriaType.DISABLED_ACCOUNT) {
        return {
          ...criterion,
          enabled: false,
          priority: 9,
        }
      }

      if (criterion.id === SortingCriteriaType.CUSTOM_REDEEM_URL) {
        return {
          ...criterion,
          priority: 0,
        }
      }

      return criterion
    })
    updatedConfig.lastModified = 1_700_000_000_000

    await act(async () => {
      expect(await context.updateSortingPriorityConfig(updatedConfig)).toBe(
        true,
      )
    })

    expect(mockedUserPreferences.setSortingPriorityConfig).toHaveBeenCalledWith(
      updatedConfig,
    )
    expect((latestContext as any)?.sortingPriorityConfig).toEqual(updatedConfig)
    expect((latestContext as any)?.preferences.sortingPriorityConfig).toEqual(
      updatedConfig,
    )
  })

  it("merges missing nested sections with defaults when runtime-backed updates arrive", async () => {
    const preferences = clonePreferences()
    delete (preferences as Partial<UserPreferences>).autoCheckin
    delete (preferences as Partial<UserPreferences>).balanceHistory
    delete (preferences as Partial<UserPreferences>).managedSiteModelSync
    delete (preferences as Partial<UserPreferences>).redemptionAssist
    delete (preferences as Partial<UserPreferences>).webAiApiCheck
    delete (preferences as Partial<UserPreferences>).tempWindowFallbackReminder

    const context = await renderProvider(preferences)

    await act(async () => {
      await context.updateAutoCheckin({
        globalEnabled: false,
      })
      await context.updateBalanceHistory({
        retentionDays: 14,
      })
      await context.updateNewApiModelSync({
        allowedModels: ["gpt-4.1"],
      })
      await context.updateRedemptionAssist({
        enabled: false,
      })
      await context.updateWebAiApiCheck({
        enabled: false,
        contextMenu: { enabled: false },
      })
      await context.updateTempWindowFallbackReminder({
        dismissed: true,
      })
    })

    expect((latestContext as any)?.preferences.autoCheckin).toMatchObject({
      ...DEFAULT_PREFERENCES.autoCheckin,
      globalEnabled: false,
    })
    expect((latestContext as any)?.preferences.balanceHistory).toMatchObject({
      ...DEFAULT_BALANCE_HISTORY_PREFERENCES,
      retentionDays: 14,
    })
    expect(
      (latestContext as any)?.preferences.managedSiteModelSync,
    ).toMatchObject({
      ...DEFAULT_PREFERENCES.managedSiteModelSync,
      allowedModels: ["gpt-4.1"],
    })
    expect((latestContext as any)?.preferences.redemptionAssist).toMatchObject({
      ...DEFAULT_REDEMPTION_ASSIST_PREFERENCES,
      enabled: false,
    })
    expect((latestContext as any)?.preferences.webAiApiCheck).toMatchObject({
      ...DEFAULT_WEB_AI_API_CHECK_PREFERENCES,
      enabled: false,
      contextMenu: { enabled: false },
    })
    expect(
      (latestContext as any)?.preferences.tempWindowFallbackReminder,
    ).toEqual({
      dismissed: true,
    })

    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.AutoCheckinUpdateSettings,
      settings: {
        globalEnabled: false,
      },
    })
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.BalanceHistoryUpdateSettings,
      settings: {
        retentionDays: 14,
      },
    })
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.ModelSyncUpdateSettings,
      settings: {
        allowedModels: ["gpt-4.1"],
      },
    })
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.RedemptionAssistUpdateSettings,
      settings: {
        enabled: false,
      },
    })
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.PreferencesRefreshContextMenus,
    })
  })

  it("applies section reset helpers back to defaults and keeps derived values stable", async () => {
    const preferences = clonePreferences()
    preferences.currencyType = "CNY"
    preferences.activeTab = DATA_TYPE_BALANCE
    preferences.themeMode = "dark"
    preferences.language = "en"
    preferences.managedSiteType = VELOERA
    preferences.accountAutoRefresh = {
      ...preferences.accountAutoRefresh,
      enabled: true,
      interval: 180_000,
      minInterval: 45_000,
      refreshOnOpen: true,
    }
    preferences.newApi = {
      ...preferences.newApi,
      baseUrl: "https://changed.example",
      adminToken: "changed-token",
    }
    preferences.doneHub = {
      ...DEFAULT_DONE_HUB_CONFIG,
      baseUrl: "https://donehub.example",
    }
    preferences.veloera = {
      ...preferences.veloera,
      adminToken: "veloera-token",
    }
    preferences.octopus = {
      ...preferences.octopus,
      baseUrl: "https://octopus.example",
      username: "octopus-user",
      password: "octopus-pass",
    }
    preferences.axonHub = {
      baseUrl: "https://axonhub.example",
      email: "admin@example.com",
      password: "secret-password",
    }
    preferences.cliProxy = {
      ...preferences.cliProxy,
      baseUrl: "https://cli.example",
      managementKey: "cli-key",
    }
    preferences.claudeCodeRouter = {
      ...preferences.claudeCodeRouter,
      baseUrl: "https://ccr.example",
      apiKey: "ccr-key",
    }
    preferences.autoCheckin = {
      ...preferences.autoCheckin,
      globalEnabled: false,
    }
    preferences.balanceHistory = {
      ...DEFAULT_BALANCE_HISTORY_PREFERENCES,
      enabled: true,
      retentionDays: 90,
    }
    preferences.modelRedirect = {
      ...preferences.modelRedirect,
      enabled: true,
    }
    preferences.redemptionAssist = {
      ...DEFAULT_REDEMPTION_ASSIST_PREFERENCES,
      enabled: false,
    }
    preferences.webAiApiCheck = {
      ...DEFAULT_WEB_AI_API_CHECK_PREFERENCES,
      enabled: false,
    }
    preferences.webdav = {
      ...DEFAULT_PREFERENCES.webdav,
      url: "https://dav.example",
      username: "dav-user",
      password: "dav-pass",
      autoSync: true,
      syncInterval: 300,
    }
    preferences.sortingPriorityConfig = {
      ...structuredClone(DEFAULT_SORTING_PRIORITY_CONFIG),
      lastModified: Date.now(),
    }

    const context = await renderProvider(preferences)

    await act(async () => {
      await context.resetDisplaySettings()
      await context.resetAutoRefreshConfig()
      await context.resetNewApiConfig()
      await context.resetDoneHubConfig()
      await context.resetVeloeraConfig()
      await context.resetOctopusConfig()
      await context.resetAxonHubConfig()
      await context.resetClaudeCodeHubConfig()
      await context.resetNewApiModelSyncConfig()
      await context.resetCliProxyConfig()
      await context.resetClaudeCodeRouterConfig()
      await context.resetAutoCheckinConfig()
      await context.resetRedemptionAssistConfig()
      await context.resetWebAiApiCheckConfig()
      await context.resetModelRedirectConfig()
      await context.resetWebdavConfig()
      await context.resetLoggingSettings()
      await context.resetSortingPriorityConfig()
    })

    expect((latestContext as any)?.preferences.currencyType).toBe(
      DEFAULT_PREFERENCES.currencyType,
    )
    expect((latestContext as any)?.preferences.activeTab).toBe(
      DEFAULT_PREFERENCES.activeTab,
    )
    expect((latestContext as any)?.preferences.accountAutoRefresh).toEqual(
      DEFAULT_PREFERENCES.accountAutoRefresh,
    )
    expect((latestContext as any)?.preferences.newApi).toEqual(
      DEFAULT_PREFERENCES.newApi,
    )
    expect((latestContext as any)?.preferences.doneHub).toEqual(
      DEFAULT_PREFERENCES.doneHub,
    )
    expect((latestContext as any)?.preferences.veloera).toEqual(
      DEFAULT_PREFERENCES.veloera,
    )
    expect((latestContext as any)?.preferences.octopus).toEqual(
      DEFAULT_PREFERENCES.octopus,
    )
    expect((latestContext as any)?.preferences.axonHub).toEqual(
      DEFAULT_AXON_HUB_CONFIG,
    )
    expect((latestContext as any)?.preferences.claudeCodeHub).toEqual(
      DEFAULT_PREFERENCES.claudeCodeHub,
    )
    expect((latestContext as any)?.preferences.cliProxy).toEqual(
      DEFAULT_PREFERENCES.cliProxy,
    )
    expect((latestContext as any)?.preferences.claudeCodeRouter).toEqual(
      DEFAULT_PREFERENCES.claudeCodeRouter,
    )
    expect((latestContext as any)?.preferences.autoCheckin).toEqual(
      DEFAULT_PREFERENCES.autoCheckin,
    )
    expect((latestContext as any)?.preferences.redemptionAssist).toEqual(
      DEFAULT_PREFERENCES.redemptionAssist,
    )
    expect((latestContext as any)?.preferences.webAiApiCheck).toEqual(
      DEFAULT_PREFERENCES.webAiApiCheck,
    )
    expect((latestContext as any)?.preferences.modelRedirect).toEqual(
      DEFAULT_PREFERENCES.modelRedirect,
    )
    expect((latestContext as any)?.preferences.webdav).toEqual(
      expect.objectContaining(DEFAULT_PREFERENCES.webdav),
    )
    expect((latestContext as any)?.preferences.sortingPriorityConfig).toBe(
      undefined,
    )

    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.AutoRefreshUpdateSettings,
      settings: { accountAutoRefresh: DEFAULT_PREFERENCES.accountAutoRefresh },
    })
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.ModelSyncUpdateSettings,
      settings: DEFAULT_PREFERENCES.managedSiteModelSync,
    })
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.AutoCheckinUpdateSettings,
      settings: DEFAULT_PREFERENCES.autoCheckin,
    })
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.RedemptionAssistUpdateSettings,
      settings: DEFAULT_PREFERENCES.redemptionAssist,
    })
  })

  it("reloads defaults through resetToDefaults and broadcasts the reset to background services", async () => {
    const firstPreferences = clonePreferences()
    firstPreferences.currencyType = "CNY"
    const defaults = clonePreferences()

    mockedUserPreferences.getPreferences
      .mockResolvedValueOnce(firstPreferences)
      .mockResolvedValueOnce(defaults)

    const context = await renderProvider(firstPreferences)

    await act(async () => {
      await context.resetToDefaults()
    })

    expect(mockedUserPreferences.resetToDefaults).toHaveBeenCalledTimes(1)
    expect(mockedUserPreferences.getPreferences).toHaveBeenCalledTimes(2)
    expect((latestContext as any)?.preferences.currencyType).toBe(
      DEFAULT_PREFERENCES.currencyType,
    )
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.AutoRefreshUpdateSettings,
      settings: { accountAutoRefresh: DEFAULT_PREFERENCES.accountAutoRefresh },
    })
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.AutoCheckinUpdateSettings,
      settings: DEFAULT_PREFERENCES.autoCheckin,
    })
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.ModelSyncUpdateSettings,
      settings: DEFAULT_PREFERENCES.managedSiteModelSync,
    })
  })

  it("keeps existing consumers mounted while preferences reload in the background", async () => {
    const initialPreferences = clonePreferences()
    initialPreferences.activeTab = DATA_TYPE_BALANCE

    const refreshedPreferences = clonePreferences()
    refreshedPreferences.activeTab = DATA_TYPE_CASHFLOW

    const deferredPreferences = createDeferred<UserPreferences>()

    mockedUserPreferences.getPreferences
      .mockResolvedValueOnce(initialPreferences)
      .mockReturnValueOnce(deferredPreferences.promise)

    const context = await renderProvider(initialPreferences)

    expect(screen.getByTestId("active-tab")).toHaveTextContent(
      DATA_TYPE_BALANCE,
    )

    await act(async () => {
      void context.loadPreferences()
    })

    expect(screen.getByTestId("loading-state")).toHaveTextContent("true")
    expect(screen.getByTestId("active-tab")).toHaveTextContent(
      DATA_TYPE_BALANCE,
    )

    await act(async () => {
      deferredPreferences.resolve(refreshedPreferences)
      await deferredPreferences.promise
    })

    await waitFor(() => {
      expect(screen.getByTestId("loading-state")).toHaveTextContent("false")
    })

    expect(screen.getByTestId("active-tab")).toHaveTextContent(
      DATA_TYPE_CASHFLOW,
    )
  })

  it("keeps the current state when persistence helpers fail and skips runtime broadcasts", async () => {
    const preferences = clonePreferences()
    preferences.activeTab = DATA_TYPE_BALANCE
    preferences.currencyType = "USD"
    preferences.themeMode = "system"
    preferences.managedSiteType = VELOERA

    mockedUserPreferences.updateActiveTab.mockResolvedValue(false)
    mockedUserPreferences.savePreferencesWithResult.mockResolvedValue(null)
    mockedUserPreferences.updateCurrencyType.mockResolvedValue(false)
    mockedUserPreferences.updateSortConfig.mockResolvedValue(false)
    mockedUserPreferences.setSortingPriorityConfig.mockResolvedValue(false)
    mockedUserPreferences.updateOpenChangelogOnUpdate.mockResolvedValue(false)
    mockedUserPreferences.updateAutoProvisionKeyOnAccountAdd.mockResolvedValue(
      false,
    )
    mockedUserPreferences.updateAutoFillCurrentSiteUrlOnAccountAdd.mockResolvedValue(
      false,
    )
    mockedUserPreferences.updateWarnOnDuplicateAccountAdd.mockResolvedValue(
      false,
    )
    mockedUserPreferences.updateManagedSiteType.mockResolvedValue(false)
    mockedUserPreferences.updateLoggingPreferences.mockResolvedValue(false)

    const context = await renderProvider(preferences)

    await act(async () => {
      expect(await context.updateActiveTab(DATA_TYPE_CASHFLOW)).toBe(false)
      expect(await context.updateActionClickBehavior("sidepanel")).toBe(false)
      expect(await context.updateOpenChangelogOnUpdate(false)).toBe(false)
      expect(await context.updateAutoProvisionKeyOnAccountAdd(true)).toBe(false)
      expect(await context.updateAutoFillCurrentSiteUrlOnAccountAdd(true)).toBe(
        false,
      )
      expect(await context.updateWarnOnDuplicateAccountAdd(false)).toBe(false)
      expect(await context.updateDefaultTab(DATA_TYPE_CASHFLOW)).toBe(false)
      expect(await context.updateCurrencyType("CNY")).toBe(false)
      expect(await context.updateShowTodayCashflow(false)).toBe(false)
      expect(await context.updateSortConfig(DATA_TYPE_INCOME, "asc")).toBe(
        false,
      )
      expect(
        await context.updateSortingPriorityConfig(
          DEFAULT_SORTING_PRIORITY_CONFIG,
        ),
      ).toBe(false)
      expect(await context.updateAutoRefresh(true)).toBe(false)
      expect(await context.updateRefreshInterval(60_000)).toBe(false)
      expect(await context.updateMinRefreshInterval(15_000)).toBe(false)
      expect(await context.updateRefreshOnOpen(true)).toBe(false)
      expect(await context.updateNewApiBaseUrl("https://new-api.example")).toBe(
        false,
      )
      expect(
        await context.updateDoneHubBaseUrl("https://donehub.example"),
      ).toBe(false)
      expect(
        await context.updateVeloeraBaseUrl("https://veloera.example"),
      ).toBe(false)
      expect(
        await context.updateOctopusBaseUrl("https://octopus.example"),
      ).toBe(false)
      expect(await context.updateManagedSiteType(VELOERA)).toBe(false)
      expect(await context.updateThemeMode("dark")).toBe(false)
      expect(await context.updateLoggingConsoleEnabled(false)).toBe(false)
      expect(await context.updateLoggingLevel("warn")).toBe(false)
      expect(await context.updateAutoCheckin({ globalEnabled: false })).toBe(
        false,
      )
      expect(await context.updateBalanceHistory({ enabled: true })).toBe(false)
      expect(await context.updateNewApiModelSync({ enabled: true })).toBe(false)
      expect(await context.updateModelRedirect({ enabled: true })).toBe(false)
      expect(await context.updateRedemptionAssist({ enabled: false })).toBe(
        false,
      )
      expect(await context.updateWebAiApiCheck({ enabled: false })).toBe(false)
      expect(await context.updateTempWindowFallback({ enabled: false })).toBe(
        false,
      )
      expect(
        await context.updateTempWindowFallbackReminder({ dismissed: true }),
      ).toBe(false)
      expect(await context.updateCliProxyBaseUrl("https://cli.example")).toBe(
        false,
      )
      expect(await context.updateCliProxyManagementKey("cli-key")).toBe(false)
      expect(
        await context.updateClaudeCodeRouterBaseUrl("https://ccr.example"),
      ).toBe(false)
      expect(await context.updateClaudeCodeRouterApiKey("ccr-key")).toBe(false)
    })

    expect((latestContext as any)?.activeTab).toBe(DATA_TYPE_BALANCE)
    expect((latestContext as any)?.currencyType).toBe("USD")
    expect((latestContext as any)?.themeMode).toBe("system")
    expect((latestContext as any)?.preferences.newApi.baseUrl).toBe(
      DEFAULT_PREFERENCES.newApi.baseUrl,
    )
    expect(mockedSendRuntimeMessage).not.toHaveBeenCalled()
  })

  it("keeps stored backend credentials untouched when credential writes fail", async () => {
    const preferences = clonePreferences()
    preferences.newApi = {
      ...preferences.newApi,
      adminToken: "stored-new-api-admin",
      userId: "stored-new-api-user-id",
      username: "stored-new-api-user",
      password: "stored-new-api-password",
      totpSecret: "stored-new-api-totp",
    }
    preferences.doneHub = {
      ...(preferences.doneHub ?? DEFAULT_DONE_HUB_CONFIG),
      adminToken: "stored-donehub-admin",
      userId: "stored-donehub-user-id",
    }
    preferences.veloera = {
      ...preferences.veloera,
      adminToken: "stored-veloera-admin",
      userId: "stored-veloera-user-id",
    }
    preferences.octopus = {
      ...(preferences.octopus ?? DEFAULT_OCTOPUS_CONFIG),
      username: "stored-octopus-user",
      password: "stored-octopus-password",
    }

    mockedUserPreferences.savePreferencesWithResult.mockResolvedValue(null)

    const context = await renderProvider(preferences)

    await act(async () => {
      expect(await context.updateNewApiAdminToken("next-new-api-admin")).toBe(
        false,
      )
      expect(await context.updateNewApiUserId("next-new-api-user-id")).toBe(
        false,
      )
      expect(await context.updateNewApiUsername("next-new-api-user")).toBe(
        false,
      )
      expect(await context.updateNewApiPassword("next-new-api-password")).toBe(
        false,
      )
      expect(await context.updateNewApiTotpSecret("next-new-api-totp")).toBe(
        false,
      )
      expect(await context.updateDoneHubAdminToken("next-donehub-admin")).toBe(
        false,
      )
      expect(await context.updateDoneHubUserId("next-donehub-user-id")).toBe(
        false,
      )
      expect(await context.updateVeloeraAdminToken("next-veloera-admin")).toBe(
        false,
      )
      expect(await context.updateVeloeraUserId("next-veloera-user-id")).toBe(
        false,
      )
      expect(await context.updateOctopusUsername("next-octopus-user")).toBe(
        false,
      )
      expect(await context.updateOctopusPassword("next-octopus-password")).toBe(
        false,
      )
    })

    expect((latestContext as any)?.preferences.newApi).toEqual(
      expect.objectContaining({
        adminToken: "stored-new-api-admin",
        userId: "stored-new-api-user-id",
        username: "stored-new-api-user",
        password: "stored-new-api-password",
        totpSecret: "stored-new-api-totp",
      }),
    )
    expect((latestContext as any)?.preferences.doneHub).toEqual(
      expect.objectContaining({
        adminToken: "stored-donehub-admin",
        userId: "stored-donehub-user-id",
      }),
    )
    expect((latestContext as any)?.preferences.veloera).toEqual(
      expect.objectContaining({
        adminToken: "stored-veloera-admin",
        userId: "stored-veloera-user-id",
      }),
    )
    expect((latestContext as any)?.preferences.octopus).toEqual(
      expect.objectContaining({
        username: "stored-octopus-user",
        password: "stored-octopus-password",
      }),
    )
    expect(mockedSendRuntimeMessage).not.toHaveBeenCalled()
  })

  it("keeps the current state when reset helpers fail and skips reset broadcasts", async () => {
    const preferences = clonePreferences()
    preferences.activeTab = DATA_TYPE_BALANCE
    preferences.currencyType = "CNY"
    preferences.themeMode = "dark"
    preferences.language = "en"
    preferences.accountAutoRefresh = {
      ...preferences.accountAutoRefresh,
      enabled: true,
      interval: 180_000,
    }
    preferences.autoCheckin = {
      ...preferences.autoCheckin,
      globalEnabled: false,
    }
    preferences.redemptionAssist = {
      ...DEFAULT_REDEMPTION_ASSIST_PREFERENCES,
      relaxedCodeValidation: false,
    }
    preferences.webAiApiCheck = {
      ...DEFAULT_WEB_AI_API_CHECK_PREFERENCES,
      autoDetect: {
        enabled: true,
        urlWhitelist: {
          patterns: ["https://allowed.example/*"],
        },
      },
    }
    preferences.sortingPriorityConfig = {
      ...structuredClone(DEFAULT_SORTING_PRIORITY_CONFIG),
      lastModified: Date.now(),
    }

    mockedUserPreferences.resetToDefaults.mockResolvedValue(false)
    mockedUserPreferences.resetDisplaySettings.mockResolvedValue(false)
    mockedUserPreferences.resetAutoRefreshConfig.mockResolvedValue(false)
    mockedUserPreferences.resetNewApiConfig.mockResolvedValue(false)
    mockedUserPreferences.resetDoneHubConfig.mockResolvedValue(false)
    mockedUserPreferences.resetVeloeraConfig.mockResolvedValue(false)
    mockedUserPreferences.resetOctopusConfig.mockResolvedValue(false)
    mockedUserPreferences.resetClaudeCodeHubConfig.mockResolvedValue(false)
    mockedUserPreferences.resetNewApiModelSyncConfig.mockResolvedValue(false)
    mockedUserPreferences.resetCliProxyConfig.mockResolvedValue(false)
    mockedUserPreferences.resetClaudeCodeRouterConfig.mockResolvedValue(false)
    mockedUserPreferences.resetAutoCheckinConfig.mockResolvedValue(false)
    mockedUserPreferences.resetRedemptionAssist.mockResolvedValue(false)
    mockedUserPreferences.resetWebAiApiCheck.mockResolvedValue(false)
    mockedUserPreferences.resetModelRedirectConfig.mockResolvedValue(false)
    mockedUserPreferences.resetWebdavConfig.mockResolvedValue(false)
    mockedUserPreferences.updateLoggingPreferences.mockResolvedValue(false)
    mockedUserPreferences.resetSortingPriorityConfig.mockResolvedValue(false)

    const context = await renderProvider(preferences)

    await act(async () => {
      expect(await context.resetToDefaults()).toBe(false)
      expect(await context.resetDisplaySettings()).toBe(false)
      expect(await context.resetAutoRefreshConfig()).toBe(false)
      expect(await context.resetNewApiConfig()).toBe(false)
      expect(await context.resetDoneHubConfig()).toBe(false)
      expect(await context.resetVeloeraConfig()).toBe(false)
      expect(await context.resetOctopusConfig()).toBe(false)
      expect(await context.resetClaudeCodeHubConfig()).toBe(false)
      expect(await context.resetNewApiModelSyncConfig()).toBe(false)
      expect(await context.resetCliProxyConfig()).toBe(false)
      expect(await context.resetClaudeCodeRouterConfig()).toBe(false)
      expect(await context.resetAutoCheckinConfig()).toBe(false)
      expect(await context.resetRedemptionAssistConfig()).toBe(false)
      expect(await context.resetWebAiApiCheckConfig()).toBe(false)
      expect(await context.resetModelRedirectConfig()).toBe(false)
      expect(await context.resetWebdavConfig()).toBe(false)
      expect(await context.resetLoggingSettings()).toBe(false)
      expect(await context.resetSortingPriorityConfig()).toBe(false)
    })

    expect((latestContext as any)?.preferences).toEqual(preferences)
    expect(mockedUserPreferences.getPreferences).toHaveBeenCalledTimes(1)
    expect(mockedSendRuntimeMessage).not.toHaveBeenCalled()
  })

  it("avoids refreshing context menus for non-visibility feature updates", async () => {
    const context = await renderProvider()

    await act(async () => {
      await context.updateRedemptionAssist({
        relaxedCodeValidation: false,
        urlWhitelist: {
          enabled: true,
          patterns: ["https://redeem.example/*"],
          includeAccountSiteUrls: true,
          includeCheckInAndRedeemUrls: false,
        },
      })

      await context.updateWebAiApiCheck({
        autoDetect: {
          enabled: true,
          urlWhitelist: {
            patterns: ["https://api-check.example/*"],
          },
        },
      })
    })

    expect((latestContext as any)?.preferences.redemptionAssist).toEqual(
      expect.objectContaining({
        relaxedCodeValidation: false,
        urlWhitelist: expect.objectContaining({
          patterns: ["https://redeem.example/*"],
          includeCheckInAndRedeemUrls: false,
        }),
      }),
    )
    expect((latestContext as any)?.preferences.webAiApiCheck).toEqual(
      expect.objectContaining({
        autoDetect: expect.objectContaining({
          enabled: true,
          urlWhitelist: { patterns: ["https://api-check.example/*"] },
        }),
      }),
    )

    expect(mockedSendRuntimeMessage).toHaveBeenCalledTimes(1)
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.RedemptionAssistUpdateSettings,
      settings: {
        relaxedCodeValidation: false,
        urlWhitelist: {
          enabled: true,
          patterns: ["https://redeem.example/*"],
          includeAccountSiteUrls: true,
          includeCheckInAndRedeemUrls: false,
        },
      },
    })
    expect(mockedSendRuntimeMessage).not.toHaveBeenCalledWith({
      action: RuntimeActionIds.PreferencesRefreshContextMenus,
    })
  })

  it("refreshes context menus when only the feature context-menu visibility changes", async () => {
    const preferences = clonePreferences()
    preferences.redemptionAssist = {
      ...DEFAULT_REDEMPTION_ASSIST_PREFERENCES,
      enabled: true,
      contextMenu: { enabled: true },
    }
    preferences.webAiApiCheck = {
      ...DEFAULT_WEB_AI_API_CHECK_PREFERENCES,
      enabled: true,
      contextMenu: { enabled: true },
    }

    const context = await renderProvider(preferences)

    await act(async () => {
      await context.updateRedemptionAssist({
        contextMenu: { enabled: false },
      })
      await context.updateWebAiApiCheck({
        contextMenu: { enabled: false },
      })
    })

    expect((latestContext as any)?.preferences.redemptionAssist).toEqual(
      expect.objectContaining({
        enabled: true,
        contextMenu: { enabled: false },
      }),
    )
    expect((latestContext as any)?.preferences.webAiApiCheck).toEqual(
      expect.objectContaining({
        enabled: true,
        contextMenu: { enabled: false },
      }),
    )

    const refreshCalls = mockedSendRuntimeMessage.mock.calls.filter(
      ([message]) =>
        message?.action === RuntimeActionIds.PreferencesRefreshContextMenus,
    )
    expect(refreshCalls).toHaveLength(2)
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.RedemptionAssistUpdateSettings,
      settings: {
        contextMenu: { enabled: false },
      },
    })
  })

  it("normalizes hidden cashflow selections only when disabling would leave the UI on hidden tabs or sort fields", async () => {
    const preferences = clonePreferences()
    preferences.showTodayCashflow = true
    preferences.activeTab = DATA_TYPE_CASHFLOW
    preferences.sortField = DATA_TYPE_CONSUMPTION

    let context = await renderProvider(preferences)

    await act(async () => {
      await context.updateShowTodayCashflow(false)
    })

    expect(mockedUserPreferences.savePreferences).toHaveBeenCalledWith({
      showTodayCashflow: false,
      activeTab: DATA_TYPE_BALANCE,
      sortField: DATA_TYPE_BALANCE,
    })
    expect((latestContext as any)?.preferences.showTodayCashflow).toBe(false)
    expect((latestContext as any)?.preferences.activeTab).toBe(
      DATA_TYPE_BALANCE,
    )
    expect((latestContext as any)?.preferences.sortField).toBe(
      DATA_TYPE_BALANCE,
    )

    mockedUserPreferences.savePreferences.mockClear()

    const preservedPreferences = clonePreferences()
    preservedPreferences.showTodayCashflow = true
    preservedPreferences.activeTab = DATA_TYPE_BALANCE
    preservedPreferences.sortField = DATA_TYPE_BALANCE

    context = await renderProvider(preservedPreferences)

    await act(async () => {
      await context.updateShowTodayCashflow(false)
    })

    expect(mockedUserPreferences.savePreferences).toHaveBeenCalledWith({
      showTodayCashflow: false,
    })
    expect((latestContext as any)?.preferences.activeTab).toBe(
      DATA_TYPE_BALANCE,
    )
    expect((latestContext as any)?.preferences.sortField).toBe(
      DATA_TYPE_BALANCE,
    )
  })

  it("does not backfill hidden-tab normalization when re-enabling today cashflow from an already visible selection", async () => {
    const preferences = clonePreferences()
    preferences.showTodayCashflow = false
    preferences.activeTab = DATA_TYPE_BALANCE
    preferences.sortField = DATA_TYPE_BALANCE

    const context = await renderProvider(preferences)

    await act(async () => {
      await context.updateShowTodayCashflow(true)
    })

    expect(mockedUserPreferences.savePreferences).toHaveBeenCalledWith({
      showTodayCashflow: true,
    })
    expect((latestContext as any)?.preferences.showTodayCashflow).toBe(true)
    expect((latestContext as any)?.preferences.activeTab).toBe(
      DATA_TYPE_BALANCE,
    )
    expect((latestContext as any)?.preferences.sortField).toBe(
      DATA_TYPE_BALANCE,
    )
  })

  it("does not persist a fallback active tab for legacy snapshots that disable today cashflow without an active tab", async () => {
    const preferences = clonePreferences()
    preferences.showTodayCashflow = false
    preferences.sortField = DATA_TYPE_BALANCE
    delete (preferences as Partial<UserPreferences>).activeTab

    await renderProvider(preferences)

    expect(mockedUserPreferences.savePreferences).not.toHaveBeenCalled()
    expect((latestContext as any)?.activeTab).toBe(DATA_TYPE_CASHFLOW)
    expect((latestContext as any)?.sortField).toBe(DATA_TYPE_BALANCE)
    expect((latestContext as any)?.showTodayCashflow).toBe(false)
  })

  it("uses safe provider defaults for legacy snapshots that omit top-level preference fields", async () => {
    const preferences = clonePreferences()
    delete (preferences as Partial<UserPreferences>).activeTab
    delete (preferences as Partial<UserPreferences>).currencyType
    delete (preferences as Partial<UserPreferences>).showTodayCashflow
    delete (preferences as Partial<UserPreferences>).sortField
    delete (preferences as Partial<UserPreferences>).sortOrder
    delete (preferences as Partial<UserPreferences>).accountAutoRefresh
    delete (preferences as Partial<UserPreferences>).actionClickBehavior
    delete (preferences as Partial<UserPreferences>).openChangelogOnUpdate
    delete (preferences as Partial<UserPreferences>)
      .autoProvisionKeyOnAccountAdd
    delete (preferences as Partial<UserPreferences>)
      .autoFillCurrentSiteUrlOnAccountAdd
    delete (preferences as Partial<UserPreferences>).warnOnDuplicateAccountAdd
    delete (preferences as Partial<UserPreferences>).managedSiteType
    delete (preferences as Partial<UserPreferences>).themeMode
    delete (preferences as Partial<UserPreferences>).logging
    delete (preferences as Partial<UserPreferences>).tempWindowFallback
    delete (preferences as Partial<UserPreferences>).tempWindowFallbackReminder

    await renderProvider(preferences)

    expect((latestContext as any)?.activeTab).toBe(DATA_TYPE_CASHFLOW)
    expect((latestContext as any)?.currencyType).toBe("USD")
    expect((latestContext as any)?.showTodayCashflow).toBe(true)
    expect((latestContext as any)?.sortField).toBe(DATA_TYPE_BALANCE)
    expect((latestContext as any)?.sortOrder).toBe("desc")
    expect((latestContext as any)?.autoRefresh).toBe(
      DEFAULT_PREFERENCES.accountAutoRefresh.enabled,
    )
    expect((latestContext as any)?.refreshInterval).toBe(
      DEFAULT_PREFERENCES.accountAutoRefresh.interval,
    )
    expect((latestContext as any)?.minRefreshInterval).toBe(
      DEFAULT_PREFERENCES.accountAutoRefresh.minInterval,
    )
    expect((latestContext as any)?.refreshOnOpen).toBe(
      DEFAULT_PREFERENCES.accountAutoRefresh.refreshOnOpen,
    )
    expect((latestContext as any)?.actionClickBehavior).toBe("popup")
    expect((latestContext as any)?.openChangelogOnUpdate).toBe(
      DEFAULT_PREFERENCES.openChangelogOnUpdate,
    )
    expect((latestContext as any)?.autoProvisionKeyOnAccountAdd).toBe(
      DEFAULT_PREFERENCES.autoProvisionKeyOnAccountAdd,
    )
    expect((latestContext as any)?.autoFillCurrentSiteUrlOnAccountAdd).toBe(
      DEFAULT_PREFERENCES.autoFillCurrentSiteUrlOnAccountAdd,
    )
    expect((latestContext as any)?.warnOnDuplicateAccountAdd).toBe(
      DEFAULT_PREFERENCES.warnOnDuplicateAccountAdd,
    )
    expect((latestContext as any)?.managedSiteType).toBe(
      DEFAULT_PREFERENCES.managedSiteType,
    )
    expect((latestContext as any)?.themeMode).toBe("system")
    expect((latestContext as any)?.loggingConsoleEnabled).toBe(
      DEFAULT_PREFERENCES.logging.consoleEnabled,
    )
    expect((latestContext as any)?.loggingLevel).toBe(
      DEFAULT_PREFERENCES.logging.level,
    )
    expect((latestContext as any)?.tempWindowFallback).toEqual(
      DEFAULT_PREFERENCES.tempWindowFallback,
    )
    expect((latestContext as any)?.tempWindowFallbackReminder).toEqual(
      DEFAULT_PREFERENCES.tempWindowFallbackReminder,
    )
    expect(mockedUserPreferences.savePreferences).not.toHaveBeenCalled()
  })

  it("falls back to default nested preference shapes when optional sections are missing", async () => {
    const preferences = clonePreferences()
    delete (preferences as Partial<UserPreferences>).balanceHistory
    delete (preferences as Partial<UserPreferences>).managedSiteModelSync
    delete (preferences as Partial<UserPreferences>).redemptionAssist
    delete (preferences as Partial<UserPreferences>).webAiApiCheck
    delete (preferences as Partial<UserPreferences>).tempWindowFallback
    delete (preferences as Partial<UserPreferences>).tempWindowFallbackReminder

    const context = await renderProvider(preferences)

    await act(async () => {
      await context.updateBalanceHistory({
        enabled: true,
        retentionDays: 30,
      })
      await context.updateNewApiModelSync({
        enabled: true,
        allowedModels: ["gpt-4o"],
      })
      await context.updateRedemptionAssist({
        contextMenu: { enabled: false },
      })
      await context.updateWebAiApiCheck({
        autoDetect: {
          enabled: true,
          urlWhitelist: {
            patterns: [],
          },
        },
      })
      await context.updateTempWindowFallback({
        useForManualRefresh: false,
      })
      await context.updateTempWindowFallbackReminder({
        dismissed: true,
      })
    })

    expect((latestContext as any)?.preferences.balanceHistory).toEqual(
      expect.objectContaining({
        ...DEFAULT_BALANCE_HISTORY_PREFERENCES,
        enabled: true,
        retentionDays: 30,
      }),
    )
    expect((latestContext as any)?.preferences.managedSiteModelSync).toEqual(
      expect.objectContaining({
        ...DEFAULT_PREFERENCES.managedSiteModelSync,
        enabled: true,
        allowedModels: ["gpt-4o"],
      }),
    )
    expect((latestContext as any)?.preferences.redemptionAssist).toEqual(
      expect.objectContaining({
        ...DEFAULT_REDEMPTION_ASSIST_PREFERENCES,
        contextMenu: { enabled: false },
      }),
    )
    expect((latestContext as any)?.preferences.webAiApiCheck).toEqual(
      expect.objectContaining({
        ...DEFAULT_WEB_AI_API_CHECK_PREFERENCES,
        autoDetect: expect.objectContaining({ enabled: true }),
      }),
    )
    expect((latestContext as any)?.preferences.tempWindowFallback).toEqual(
      expect.objectContaining({
        ...DEFAULT_PREFERENCES.tempWindowFallback,
        useForManualRefresh: false,
      }),
    )
    expect(
      (latestContext as any)?.preferences.tempWindowFallbackReminder,
    ).toEqual(expect.objectContaining({ dismissed: true }))

    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.BalanceHistoryUpdateSettings,
      settings: { enabled: true, retentionDays: 30 },
    })
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.ModelSyncUpdateSettings,
      settings: { enabled: true, allowedModels: ["gpt-4o"] },
    })
  })

  it("returns a safe fallback when the WebDAV auto-sync runtime response is invalid", async () => {
    const preferences = clonePreferences()
    preferences.webdav = {
      ...preferences.webdav,
      autoSync: true,
      syncInterval: 300,
    }
    mockedSendRuntimeMessage.mockResolvedValue(undefined)

    const context = await renderProvider(preferences)

    let response: Awaited<
      ReturnType<typeof context.updateWebdavAutoSyncSettings>
    >

    await act(async () => {
      response = await context.updateWebdavAutoSyncSettings({
        autoSync: false,
      })
    })

    expect(response!).toEqual({
      success: false,
      error: "Invalid response from background",
    })
    expect((latestContext as any)?.preferences.webdav.autoSync).toBe(true)
  })

  it("hydrates the provider from the saved WebDAV snapshot returned by background updates", async () => {
    const preferences = clonePreferences()
    preferences.webdav = {
      ...preferences.webdav,
      autoSync: true,
      syncInterval: 300,
    }
    const savedPreferences = deepOverride(preferences, {
      webdav: {
        autoSync: false,
        syncInterval: 900,
        syncStrategy: "upload_only",
      },
      lastUpdated: preferences.lastUpdated + 5,
    })
    mockedSendRuntimeMessage.mockResolvedValue({
      success: true,
      data: savedPreferences,
    })

    const context = await renderProvider(preferences)

    await act(async () => {
      await context.updateWebdavAutoSyncSettings(
        {
          autoSync: false,
          syncInterval: 900,
          syncStrategy: "upload_only",
        },
        { expectedLastUpdated: preferences.lastUpdated },
      )
    })

    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.WebdavAutoSyncUpdateSettings,
      settings: {
        autoSync: false,
        syncInterval: 900,
        syncStrategy: "upload_only",
      },
      expectedLastUpdated: preferences.lastUpdated,
    })
    expect((latestContext as any)?.preferences).toEqual(savedPreferences)
  })

  it("merges WebDAV auto-sync updates locally when background omits a saved snapshot", async () => {
    const preferences = clonePreferences()
    preferences.webdav = {
      ...preferences.webdav,
      autoSync: true,
      syncInterval: 300,
      syncStrategy: "merge",
    }
    mockedSendRuntimeMessage.mockResolvedValue({
      success: true,
    })

    const context = await renderProvider(preferences)

    await act(async () => {
      await context.updateWebdavAutoSyncSettings({
        autoSync: false,
        syncInterval: 600,
      })
    })

    expect((latestContext as any)?.preferences.webdav).toEqual({
      ...preferences.webdav,
      autoSync: false,
      syncInterval: 600,
      syncStrategy: "merge",
    })
    expect((latestContext as any)?.preferences.lastUpdated).toBe(
      preferences.lastUpdated,
    )
  })

  it("refreshes context menus when feature enabled state changes and preserves existing nested settings", async () => {
    const preferences = clonePreferences()
    preferences.redemptionAssist = {
      ...DEFAULT_REDEMPTION_ASSIST_PREFERENCES,
      enabled: true,
      relaxedCodeValidation: false,
      urlWhitelist: {
        enabled: true,
        patterns: ["https://redeem.example/*"],
        includeAccountSiteUrls: true,
        includeCheckInAndRedeemUrls: false,
      },
    }
    preferences.webAiApiCheck = {
      ...DEFAULT_WEB_AI_API_CHECK_PREFERENCES,
      enabled: true,
      autoDetect: {
        enabled: true,
        urlWhitelist: {
          patterns: ["https://api-check.example/*"],
        },
      },
    }

    const context = await renderProvider(preferences)

    await act(async () => {
      await context.updateRedemptionAssist({
        enabled: false,
      })
      await context.updateWebAiApiCheck({
        enabled: false,
      })
    })

    expect((latestContext as any)?.preferences.redemptionAssist).toEqual(
      expect.objectContaining({
        enabled: false,
        relaxedCodeValidation: false,
        urlWhitelist: expect.objectContaining({
          patterns: ["https://redeem.example/*"],
          includeCheckInAndRedeemUrls: false,
        }),
      }),
    )
    expect((latestContext as any)?.preferences.webAiApiCheck).toEqual(
      expect.objectContaining({
        enabled: false,
        autoDetect: expect.objectContaining({
          enabled: true,
          urlWhitelist: {
            patterns: ["https://api-check.example/*"],
          },
        }),
      }),
    )

    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.RedemptionAssistUpdateSettings,
      settings: {
        enabled: false,
      },
    })

    const refreshCalls = mockedSendRuntimeMessage.mock.calls.filter(
      ([message]) =>
        message?.action === RuntimeActionIds.PreferencesRefreshContextMenus,
    )
    expect(refreshCalls).toHaveLength(2)
  })

  it("merges nested content-script settings without refreshing context menus when enabled toggles are untouched", async () => {
    const preferences = clonePreferences()
    preferences.redemptionAssist = {
      ...DEFAULT_REDEMPTION_ASSIST_PREFERENCES,
      enabled: true,
      contextMenu: { enabled: true },
      urlWhitelist: {
        enabled: true,
        patterns: ["https://redeem.example/*"],
        includeAccountSiteUrls: true,
        includeCheckInAndRedeemUrls: false,
      },
    }
    preferences.webAiApiCheck = {
      ...DEFAULT_WEB_AI_API_CHECK_PREFERENCES,
      enabled: true,
      contextMenu: { enabled: true },
      autoDetect: {
        enabled: false,
        urlWhitelist: {
          patterns: ["https://api-check.example/*"],
        },
      },
    }

    const context = await renderProvider(preferences)

    await act(async () => {
      await context.updateRedemptionAssist({
        urlWhitelist: {
          ...preferences.redemptionAssist!.urlWhitelist,
          patterns: ["https://redeem.example/*", "https://extra.example/*"],
        },
      })
      await context.updateWebAiApiCheck({
        autoDetect: {
          enabled: true,
          urlWhitelist: {
            patterns: ["https://api-check.example/*", "https://new.example/*"],
          },
        },
      })
    })

    expect((latestContext as any)?.preferences.redemptionAssist).toEqual(
      expect.objectContaining({
        enabled: true,
        contextMenu: { enabled: true },
        urlWhitelist: expect.objectContaining({
          enabled: true,
          patterns: ["https://redeem.example/*", "https://extra.example/*"],
          includeAccountSiteUrls: true,
          includeCheckInAndRedeemUrls: false,
        }),
      }),
    )
    expect((latestContext as any)?.preferences.webAiApiCheck).toEqual(
      expect.objectContaining({
        enabled: true,
        contextMenu: { enabled: true },
        autoDetect: expect.objectContaining({
          enabled: true,
          urlWhitelist: {
            patterns: ["https://api-check.example/*", "https://new.example/*"],
          },
        }),
      }),
    )

    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.RedemptionAssistUpdateSettings,
      settings: {
        urlWhitelist: {
          enabled: true,
          includeAccountSiteUrls: true,
          includeCheckInAndRedeemUrls: false,
          patterns: ["https://redeem.example/*", "https://extra.example/*"],
        },
      },
    })

    const refreshCalls = mockedSendRuntimeMessage.mock.calls.filter(
      ([message]) =>
        message?.action === RuntimeActionIds.PreferencesRefreshContextMenus,
    )
    expect(refreshCalls).toHaveLength(0)
  })

  it("logs initial load failures and still clears the loading state", async () => {
    mockedUserPreferences.getPreferences.mockRejectedValueOnce(
      new Error("load failed"),
    )

    render(
      <UserPreferencesProvider>
        <Probe />
      </UserPreferencesProvider>,
    )

    await waitFor(() => {
      expect(loggerMocks.error).toHaveBeenCalledWith(
        "加载用户偏好设置失败",
        expect.any(Error),
      )
    })
  })
})
