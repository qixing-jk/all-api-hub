import { vi } from "vitest"

import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiTransport/type"

/**
 * Shared handles only. Each suite keeps vi.mock registrations local so Vitest
 * rebinds them correctly when multiple files share one worker.
 */
export const accountAutoDetectionMocks = {
  mockAutoDetectSmart: vi.fn(),
  mockSendRuntimeMessage: vi.fn(),
  mockFetchSiteStatus: vi.fn(),
  mockFetchSupportCheckIn: vi.fn(),
  mockExtractDefaultExchangeRate: vi.fn(),
  mockFetchUserInfo: vi.fn(),
  mockFetchSharedChatUserInfo: vi.fn(),
  mockCreateNewApiAccountBootstrap: vi.fn(),
  mockGetOrCreateAccessToken: vi.fn(),
  mockOpenRouterPageAction: vi.fn(),
  mockDiscoverCheckInMethods:
    vi.fn<
      typeof import("~/services/checkin/autoCheckin/discovery").discoverCheckInMethods
    >(),
  loggerMock: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  otherLoggerMock: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}

type ImportOriginal = <T>() => Promise<T>

export const accountAutoDetectionModuleMocks = {
  autoDetectService: () => ({
    autoDetectSmart: accountAutoDetectionMocks.mockAutoDetectSmart,
  }),
  logger: () => ({
    createLogger: (scope: string) =>
      scope === "AccountOperations"
        ? accountAutoDetectionMocks.loggerMock
        : accountAutoDetectionMocks.otherLoggerMock,
  }),
  browserApi: async (importOriginal: ImportOriginal) => ({
    ...(await importOriginal<typeof import("~/utils/browser/browserApi")>()),
    sendRuntimeMessage: accountAutoDetectionMocks.mockSendRuntimeMessage,
  }),
  openRouterManagementKeyActionClient: () => ({
    tempWindowOpenRouterManagementKeyAction:
      accountAutoDetectionMocks.mockOpenRouterPageAction,
    cancelTempWindowOpenRouterManagementKeyAction: vi.fn(),
  }),
  newApiAccountBootstrap: () => ({
    createNewApiAccountBootstrap:
      accountAutoDetectionMocks.mockCreateNewApiAccountBootstrap,
  }),
  sub2ApiAccountBootstrap: () => ({
    sub2ApiAccountBootstrap: {
      fetchUserInfo: accountAutoDetectionMocks.mockFetchUserInfo,
      getOrCreateAccessToken:
        accountAutoDetectionMocks.mockGetOrCreateAccessToken,
      fetchSiteStatus: accountAutoDetectionMocks.mockFetchSiteStatus,
      extractDefaultExchangeRate:
        accountAutoDetectionMocks.mockExtractDefaultExchangeRate,
      fetchCheckInSupport: accountAutoDetectionMocks.mockFetchSupportCheckIn,
      resolveRoutePath: vi.fn(),
    },
  }),
  aihubmixAccountBootstrap: () => ({
    aihubmixAccountBootstrap: {
      fetchUserInfo: accountAutoDetectionMocks.mockFetchUserInfo,
      getOrCreateAccessToken:
        accountAutoDetectionMocks.mockGetOrCreateAccessToken,
      fetchSiteStatus: accountAutoDetectionMocks.mockFetchSiteStatus,
      extractDefaultExchangeRate:
        accountAutoDetectionMocks.mockExtractDefaultExchangeRate,
      fetchCheckInSupport: accountAutoDetectionMocks.mockFetchSupportCheckIn,
      resolveRoutePath: vi.fn(),
    },
  }),
  sharedChat: async (importOriginal: ImportOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/sharedchat")
    >()),
    fetchUserInfo: accountAutoDetectionMocks.mockFetchSharedChatUserInfo,
  }),
  checkInDiscovery: () => ({
    discoverCheckInMethods:
      accountAutoDetectionMocks.mockDiscoverCheckInMethods,
  }),
}

const {
  mockAutoDetectSmart,
  mockSendRuntimeMessage,
  mockFetchSiteStatus,
  mockFetchSupportCheckIn,
  mockExtractDefaultExchangeRate,
  mockFetchUserInfo,
  mockFetchSharedChatUserInfo,
  mockCreateNewApiAccountBootstrap,
  mockGetOrCreateAccessToken,
  mockOpenRouterPageAction,
  mockDiscoverCheckInMethods,
  loggerMock,
  otherLoggerMock,
} = accountAutoDetectionMocks

export function snapshotOwnProperties(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (!value || typeof value !== "object") return value
  if (seen.has(value)) return "[Circular]"
  seen.add(value)

  return Object.fromEntries(
    Reflect.ownKeys(value).map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      const propertyValue =
        descriptor && "value" in descriptor
          ? snapshotOwnProperties(descriptor.value, seen)
          : "[Accessor]"
      return [String(key), propertyValue]
    }),
  )
}

export const currentTabFetchContext = (origin: string) => ({
  kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
  tabId: 123,
  origin,
})

export const incognitoCurrentTabFetchContext = (origin: string) => ({
  ...currentTabFetchContext(origin),
  incognito: true,
  cookieStoreId: "1-incognito",
})

export const browserFetchContext = () => ({
  kind: API_SERVICE_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
  cookieStoreId: "firefox-container-2",
})

export const serializeLoggerCalls = () =>
  JSON.stringify(
    [loggerMock, otherLoggerMock].flatMap((logger) =>
      [logger.debug, logger.error, logger.info, logger.warn].flatMap((method) =>
        method.mock.calls.map((args) =>
          args.map((value) =>
            value instanceof Error
              ? {
                  name: value.name,
                  message: value.message,
                  stack: value.stack,
                }
              : value,
          ),
        ),
      ),
    ),
  )

export function resetAccountAutoDetectionMocks() {
  vi.clearAllMocks()
  mockAutoDetectSmart.mockReset()
  mockSendRuntimeMessage.mockReset()
  mockFetchSiteStatus.mockReset()
  mockFetchSupportCheckIn.mockReset()
  mockExtractDefaultExchangeRate.mockReset()
  mockFetchUserInfo.mockReset()
  mockFetchSharedChatUserInfo.mockReset()
  mockCreateNewApiAccountBootstrap.mockReset()
  mockGetOrCreateAccessToken.mockReset()
  mockOpenRouterPageAction.mockReset()
  mockDiscoverCheckInMethods.mockReset()
  mockDiscoverCheckInMethods.mockImplementation(async (input) => ({
    config: input.config,
    decision: {
      outcome: "unknown" as const,
      matchedMethodIds: [],
      unknownMethodIds: [],
    },
    detections: {},
    timedOutMethodIds: [],
  }))
  mockCreateNewApiAccountBootstrap.mockReturnValue({
    fetchUserInfo: mockFetchUserInfo,
    getOrCreateAccessToken: mockGetOrCreateAccessToken,
    fetchSiteStatus: mockFetchSiteStatus,
    extractDefaultExchangeRate: mockExtractDefaultExchangeRate,
    fetchCheckInSupport: mockFetchSupportCheckIn,
    resolveRoutePath: vi.fn(),
  })
}

export const loadAccountAutoDetection = () =>
  import("~/services/accounts/accountAutoDetection")
