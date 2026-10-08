import { beforeEach, expect, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { loginProviderEvidence } from "~/services/accountLogin/providerEvidence"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/configuration/compatibilityConfig"
import { prepareAutomaticCheckIn } from "~/services/checkin/autoCheckin/discovery/automaticDiscovery"
import {
  getSelectedCheckInStatus,
  inspectAccountCheckIn,
} from "~/services/checkin/autoCheckin/discovery/inspection"
import {
  canAutomaticallyRetryCheckinResult,
  isRetryableCheckinResult,
} from "~/services/checkin/autoCheckin/execution/resultPolicy"
import {
  executeSelectedCheckIn,
  inspectSelectedCheckInCompatibility,
} from "~/services/checkin/autoCheckin/methods"
import { refreshSelectedStatus } from "~/services/checkin/autoCheckin/scheduling/refresh"
import { autoCheckinScheduler } from "~/services/checkin/autoCheckin/scheduling/schedulerCore"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import { notifyTaskResult } from "~/services/notifications/taskNotificationService"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { userPreferences } from "~/services/preferences/userPreferences"
import { trackProductAnalyticsActionCompleted } from "~/services/productAnalytics/actions"
import { trackProductAnalyticsEvent } from "~/services/productAnalytics/runtime/dispatch"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
  type ProtectionBypassExecution,
  type ProtectionBypassSurface,
} from "~/services/protectionBypass/contracts"
import {
  AUTO_CHECKIN_RUN_TYPE,
  type CheckinAccountResult,
} from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import {
  clearAlarm,
  createAlarm,
  getAlarm,
  hasAlarmsAPI,
  onAlarm,
} from "~/utils/browser/alarms"
import {
  isMessageReceiverUnavailableError,
  sendRuntimeMessage,
} from "~/utils/browser/runtimeMessages"
import {
  automaticExecution,
  userCommandExecution,
} from "~~/tests/services/protectionBypass/fixtures"
import { accountStorageTestSurface as accountStorage } from "~~/tests/test-utils/accountStorageTestSurface"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

vi.mock(
  "~/services/preferences/preferencesDefaults",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/preferences/preferencesDefaults")
      >()
    return {
      ...actual,
      DEFAULT_PREFERENCES: {
        autoCheckin: {
          globalEnabled: true,
          pretriggerDailyOnUiOpen: true,
          notifyUiOnCompletion: true,
          windowStart: "08:00",
          windowEnd: "10:00",
          scheduleMode: "random",
          deterministicTime: "08:00",
          retryStrategy: {
            enabled: false,
            intervalMinutes: 30,
            maxAttemptsPerDay: 3,
          },
        },
      },
    }
  },
)

export const manualExecution = (
  surface: ProtectionBypassSurface = TEMP_WINDOW_REQUEST_SOURCES.Options,
) =>
  userCommandExecution(PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin, surface)

export const retryAccountExecution = (surface: ProtectionBypassSurface) =>
  userCommandExecution(
    PROTECTION_BYPASS_USER_COMMANDS.RetryCheckinAccount,
    surface,
  )

export const OPTIONS_MANUAL_EXECUTION = manualExecution()

export const uiOpenExecution = (surface: ProtectionBypassSurface) =>
  automaticExecution(
    PROTECTION_BYPASS_FEATURES.Checkin,
    PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
    surface,
  )

export const SCHEDULED_EXECUTION = automaticExecution(
  PROTECTION_BYPASS_FEATURES.Checkin,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
)

export const RETRY_EXECUTION = automaticExecution(
  PROTECTION_BYPASS_FEATURES.Checkin,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Retry,
)

export const ACCOUNT_REFRESH_EXECUTION = automaticExecution(
  PROTECTION_BYPASS_FEATURES.AccountRefresh,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
  PROTECTION_BYPASS_SURFACES.Popup,
)

export const runnableCheckIn = (
  automaticExecutionEnabled = true,
  siteType: Parameters<
    typeof createCompatibilityCheckInConfig
  >[0]["siteType"] = SITE_TYPES.VELOERA,
) =>
  createCompatibilityCheckInConfig({
    siteType,
    supported: true,
    automaticExecutionEnabled,
  })

export const noSelectedCheckIn = () =>
  buildCheckInConfig({ automaticExecutionEnabled: true })

/**
 * One authority check: a row this version produced must record the retry
 * decision the queue reads, and that decision must be the shared policy's.
 */
export const expectRecordedRetryDecision = (result: CheckinAccountResult) => {
  expect(typeof result.retryable).toBe("boolean")
  expect(isRetryableCheckinResult(result)).toBe(result.retryable)
  expect(canAutomaticallyRetryCheckinResult(result, result.methodId)).toBe(
    result.retryable,
  )
}

export const runCheckinsForTest = (
  options: Omit<
    Parameters<typeof autoCheckinScheduler.runCheckins>[0],
    "protectionBypassExecution"
  >,
  protectionBypassExecution?: ProtectionBypassExecution,
) =>
  autoCheckinScheduler.runCheckins({
    ...options,
    protectionBypassExecution:
      protectionBypassExecution ??
      (options.runType === AUTO_CHECKIN_RUN_TYPE.DAILY
        ? SCHEDULED_EXECUTION
        : manualExecution(
            options.tempWindowRequestSource ??
              TEMP_WINDOW_REQUEST_SOURCES.Background,
          )),
  })

export const retryAccountForTest = (
  accountId: string,
  tempWindowRequestSource: (typeof TEMP_WINDOW_REQUEST_SOURCES)[keyof typeof TEMP_WINDOW_REQUEST_SOURCES] = TEMP_WINDOW_REQUEST_SOURCES.Background,
) =>
  autoCheckinScheduler.retryAccount(
    accountId,
    tempWindowRequestSource,
    retryAccountExecution(tempWindowRequestSource),
  )

export const pretriggerDailyOnUiOpenForTest = (
  params: Omit<
    Parameters<typeof autoCheckinScheduler.pretriggerDailyOnUiOpen>[0],
    "protectionBypassExecution"
  >,
) => {
  const tempWindowRequestSource =
    params.tempWindowRequestSource ?? TEMP_WINDOW_REQUEST_SOURCES.Popup
  return autoCheckinScheduler.pretriggerDailyOnUiOpen({
    ...params,
    tempWindowRequestSource,
    protectionBypassExecution: uiOpenExecution(tempWindowRequestSource),
  })
}

const starPromotionMocksHoisted = vi.hoisted(() => ({
  addCheckinSuccesses: vi.fn(),
}))

const siteTypeObservationMocksHoisted = vi.hoisted(() => ({
  recordSiteTypeObservationForResult: vi.fn(),
}))

vi.mock("~/services/starPromotion/state", () => ({
  starPromotionState: {
    addCheckinSuccesses: starPromotionMocksHoisted.addCheckinSuccesses,
  },
}))

/**
 * The scheduler asks this module to record which type a failed site resolves to;
 * tests answer locally instead of probing a site.
 */
vi.mock(
  "~/services/checkin/autoCheckin/discovery/recordSiteTypeObservation",
  () => ({
    recordSiteTypeObservationForResult:
      siteTypeObservationMocksHoisted.recordSiteTypeObservationForResult,
  }),
)

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: vi.fn(),
    savePreferences: vi.fn(),
  },
}))

vi.mock("~/services/notifications/taskNotificationService", () => ({
  notifyTaskResult: vi.fn(),
}))

vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: {
    getAllAccounts: vi.fn(),
    getEnabledAccounts: vi.fn(),
    getAccountById: vi.fn(),
  },
}))
vi.mock("~/services/accounts/accountStorage/accountCheckInState", () => ({
  accountCheckInState: {
    updateAccount: vi.fn(),
    markAccountAsSiteCheckedIn: vi.fn(),
    prepareAccountForSelectedCheckIn: vi.fn(),
  },
}))
vi.mock("~/services/accounts/accountStorage/accountRefresh", () => ({
  accountRefresh: { refreshAccount: vi.fn() },
}))
vi.mock("~/services/accounts/accountStorage/accountReadModels", () => ({
  accountReadModels: { getDisplayDataById: vi.fn() },
}))
vi.mock("~/services/accounts/accountStorage/accountPresentation", () => ({
  accountPresentation: {
    convertToDisplayData: vi.fn(),
  },
}))

vi.mock(
  "~/services/checkin/autoCheckin/scheduling/refresh",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/checkin/autoCheckin/scheduling/refresh")
      >()
    return {
      ...actual,
      refreshSelectedStatus: vi.fn(),
    }
  },
)

vi.mock("~/services/checkin/autoCheckin/methods", () => ({
  executeSelectedCheckIn: vi.fn(),
  inspectSelectedCheckInCompatibility: vi.fn(),
}))

vi.mock("~/services/checkin/autoCheckin/discovery/automaticDiscovery", () => ({
  prepareAutomaticCheckIn: vi.fn(),
}))

vi.mock("~/services/accountLogin/providerEvidence", () => ({
  loginProviderEvidence: {
    readAll: vi.fn(async () => ({})),
    record: vi.fn(),
  },
}))

vi.mock(
  "~/services/checkin/autoCheckin/discovery/inspection",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/checkin/autoCheckin/discovery/inspection")
      >()
    return {
      ...actual,
      getSelectedCheckInStatus: vi.fn(() => undefined),
    }
  },
)

vi.mock("~/services/checkin/autoCheckin/storage", () => ({
  autoCheckinStorage: {
    getStatus: vi.fn(),
    updateStatus: vi.fn(),
  },
}))

vi.mock("~/utils/browser/alarms", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browser/alarms")>()
  return {
    ...actual,
    clearAlarm: vi.fn(),
    createAlarm: vi.fn(),
    getAlarm: vi.fn(),
    hasAlarmsAPI: vi.fn(),
    onAlarm: vi.fn(),
  }
})
vi.mock("~/utils/browser/runtimeMessages", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/runtimeMessages")>()
  return {
    ...actual,
    isMessageReceiverUnavailableError: vi.fn(),
    sendRuntimeMessage: vi.fn(),
  }
})

vi.mock("~/utils/core/error", () => ({
  getErrorMessage: vi.fn((e: unknown) => String(e)),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionCompleted: vi.fn(),
}))

vi.mock(
  "~/services/productAnalytics/runtime/dispatch",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/productAnalytics/runtime/dispatch")
      >()
    return {
      ...actual,
      trackProductAnalyticsEvent: vi.fn(),
    }
  },
)

export const mockedUserPreferences = userPreferences as unknown as {
  getPreferences: ReturnType<typeof vi.fn>
  savePreferences: ReturnType<typeof vi.fn>
}

export const mockedAutoCheckinStorage = autoCheckinStorage as unknown as {
  getStatus: ReturnType<typeof vi.fn>
  updateStatus: ReturnType<typeof vi.fn>
}

export const mockedAccountStorage = accountStorage as unknown as {
  getAccountById: ReturnType<typeof vi.fn>
  getAllAccounts: ReturnType<typeof vi.fn>
  getDisplayDataById: ReturnType<typeof vi.fn>
  markAccountAsSiteCheckedIn: ReturnType<typeof vi.fn>
  refreshAccount: ReturnType<typeof vi.fn>
  convertToDisplayData: ReturnType<typeof vi.fn>
  prepareAccountForSelectedCheckIn: ReturnType<typeof vi.fn>
}

export const mockedRefreshSelectedStatus =
  refreshSelectedStatus as unknown as ReturnType<typeof vi.fn>

export const resolveProviderForTest = vi.fn()

export const mockedLoginProviderEvidence = {
  readAll: loginProviderEvidence.readAll as unknown as ReturnType<typeof vi.fn>,
  record: loginProviderEvidence.record as unknown as ReturnType<typeof vi.fn>,
}

export const mockedMethods = {
  executeSelectedCheckIn: executeSelectedCheckIn as unknown as ReturnType<
    typeof vi.fn
  >,
  inspectSelectedCheckInCompatibility:
    inspectSelectedCheckInCompatibility as unknown as ReturnType<typeof vi.fn>,
}

export const mockedInspection = {
  getSelectedCheckInStatus: getSelectedCheckInStatus as unknown as ReturnType<
    typeof vi.fn
  >,
}

export const mockedBrowserApi = {
  clearAlarm: clearAlarm as unknown as ReturnType<typeof vi.fn>,
  createAlarm: createAlarm as unknown as ReturnType<typeof vi.fn>,
  getAlarm: getAlarm as unknown as ReturnType<typeof vi.fn>,
  hasAlarmsAPI: hasAlarmsAPI as unknown as ReturnType<typeof vi.fn>,
  isMessageReceiverUnavailableError:
    isMessageReceiverUnavailableError as unknown as ReturnType<typeof vi.fn>,
  onAlarm: onAlarm as unknown as ReturnType<typeof vi.fn>,
  sendRuntimeMessage: sendRuntimeMessage as unknown as ReturnType<typeof vi.fn>,
}

export const mockedNotifyTaskResult = vi.mocked(notifyTaskResult)

export const mockedProductAnalytics = {
  trackProductAnalyticsActionCompleted:
    trackProductAnalyticsActionCompleted as unknown as ReturnType<typeof vi.fn>,
  trackProductAnalyticsEvent:
    trackProductAnalyticsEvent as unknown as ReturnType<typeof vi.fn>,
}

export function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

beforeEach(() => {
  mockedUserPreferences.getPreferences
    .mockReset()
    .mockResolvedValue(DEFAULT_PREFERENCES)
  mockedAutoCheckinStorage.getStatus.mockReset()
  mockedAutoCheckinStorage.updateStatus.mockReset()
  mockedBrowserApi.createAlarm.mockReset()
  mockedBrowserApi.getAlarm.mockReset()
  mockedBrowserApi.clearAlarm.mockReset()
  schedulerTestState.storedStatus = null
  schedulerTestState.alarmStore = {}
  schedulerTestState.statusWriteCount = 0
  resolveProviderForTest.mockReset()
  mockedMethods.inspectSelectedCheckInCompatibility.mockReset()
  mockedAccountStorage.getAllAccounts.mockReset().mockResolvedValue([])
  mockedMethods.executeSelectedCheckIn.mockReset()
  mockedLoginProviderEvidence.readAll.mockReset().mockResolvedValue({})
  mockedRefreshSelectedStatus.mockReset()
  mockedInspection.getSelectedCheckInStatus.mockReset()
  mockedInspection.getSelectedCheckInStatus.mockReturnValue(undefined)
  siteTypeObservationMocksHoisted.recordSiteTypeObservationForResult
    .mockReset()
    .mockResolvedValue(undefined)
  vi.mocked(prepareAutomaticCheckIn)
    .mockReset()
    .mockImplementation(async ({ account }) => ({
      account,
      discovered: false,
    }))

  const inspectForTest = ({
    account,
    globalAutomaticExecutionEnabled,
    loginProviderClaimedByAnother,
  }: any) => {
    const state = inspectAccountCheckIn({
      config: account.checkIn,
      siteType: account.site_type,
      accountDisabled: account.disabled,
      globalAutomaticExecutionEnabled,
      loginProviderClaimedByAnother,
      ...(account.site_url ? { siteUrl: account.site_url } : {}),
    })
    const provider = state.executionEligibility.eligible
      ? resolveProviderForTest(account)
      : null
    const providerReadiness = provider?.getReadiness(account) ?? null
    return {
      state,
      providerReadiness,
      providerAvailable: providerReadiness?.ready === true,
      provider,
    }
  }

  mockedMethods.inspectSelectedCheckInCompatibility.mockImplementation(
    inspectForTest,
  )
  mockedMethods.executeSelectedCheckIn.mockImplementation(
    async ({
      account,
      globalAutomaticExecutionEnabled,
      context,
      loginProviderClaimedByAnother,
    }: any) => {
      const inspection = inspectForTest({
        account,
        globalAutomaticExecutionEnabled,
        loginProviderClaimedByAnother,
      })
      if (!inspection.state.executionEligibility.eligible) {
        return {
          kind: "skipped",
          reason: inspection.state.executionEligibility.skipReason,
        }
      }
      const provider = inspection.provider
      if (!provider) return { kind: "skipped", reason: "no_provider" }
      const readiness = provider.getReadiness(account)
      if (!readiness.ready) {
        return { kind: "skipped", reason: readiness.reason }
      }
      const result = await provider.checkIn(account, context)
      return {
        kind: "executed",
        methodId: "new-api:daily-checkin",
        result,
        retryable: result.retryable ?? result.status === "failed",
      }
    },
  )

  mockedAutoCheckinStorage.getStatus.mockImplementation(
    async () => schedulerTestState.storedStatus,
  )
  // Mirrors AutoCheckinStorage.updateStatus: the patch is applied to the
  // currently stored status so tests exercise the same read-modify-write shape.
  mockedAutoCheckinStorage.updateStatus.mockImplementation(
    async (
      update: (current: any) => {
        patch: Record<string, unknown> | null
        result?: unknown
      },
    ) => {
      const applied = update(schedulerTestState.storedStatus)
      if (!applied.patch) {
        return { ok: true, result: applied.result ?? null }
      }

      schedulerTestState.storedStatus = {
        ...(schedulerTestState.storedStatus ?? {}),
        ...applied.patch,
      }
      schedulerTestState.statusWriteCount += 1
      return { ok: true, result: applied.result ?? null }
    },
  )

  mockedBrowserApi.createAlarm.mockImplementation(
    async (name: string, alarmInfo: any) => {
      schedulerTestState.alarmStore[name] = {
        name,
        scheduledTime: alarmInfo.when,
      }
    },
  )
  mockedBrowserApi.getAlarm.mockImplementation(
    async (name: string) => schedulerTestState.alarmStore[name],
  )
  mockedBrowserApi.clearAlarm.mockImplementation(async (name: string) => {
    delete schedulerTestState.alarmStore[name]
    return true
  })
})
export const schedulerTestState: {
  storedStatus: any
  alarmStore: Record<string, any>
  statusWriteCount: number
} = { storedStatus: null, alarmStore: {}, statusWriteCount: 0 }

export const starPromotionMocks = starPromotionMocksHoisted

export const siteTypeObservationMocks = siteTypeObservationMocksHoisted
