import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  AUTO_DETECT_FAILURE_REASONS,
  AutoDetectErrorType,
} from "~/services/accounts/utils/autoDetectUtils"
import { NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND } from "~/services/accountSiteOnboarding/contracts"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const {
  accountAutoDetectionMocks,
  accountAutoDetectionModuleMocks,
  loadAccountAutoDetection,
  resetAccountAutoDetectionMocks,
  snapshotOwnProperties,
} = await vi.hoisted(async () => import("./accountAutoDetectionTestSupport"))

vi.mock(
  "~/services/siteDetection/autoDetectService",
  accountAutoDetectionModuleMocks.autoDetectService,
)
vi.mock("~/utils/core/logger", accountAutoDetectionModuleMocks.logger)
vi.mock(
  "~/utils/browser/runtimeMessages",
  accountAutoDetectionModuleMocks.browserApi,
)
vi.mock(
  "~/services/apiAdapters/openrouter/keys/managementKeyActionClient",
  accountAutoDetectionModuleMocks.openRouterManagementKeyActionClient,
)
vi.mock(
  "~/services/apiAdapters/newApi/account/accountBootstrap",
  accountAutoDetectionModuleMocks.newApiAccountBootstrap,
)
vi.mock(
  "~/services/apiAdapters/sub2api/account/accountBootstrap",
  accountAutoDetectionModuleMocks.sub2ApiAccountBootstrap,
)
vi.mock(
  "~/services/apiAdapters/aihubmix/account/accountBootstrap",
  accountAutoDetectionModuleMocks.aihubmixAccountBootstrap,
)
vi.mock(
  "~/services/apiService/sharedchat",
  accountAutoDetectionModuleMocks.sharedChat,
)
vi.mock(
  "~/services/checkin/autoCheckin/discovery/discovery",
  accountAutoDetectionModuleMocks.checkInDiscovery,
)

const {
  loggerMock,
  mockAutoDetectSmart,
  mockLoadBootstrapFacts,
  mockFetchSupportCheckIn,
  mockFetchUserInfo,
  mockGetOrCreateAccessToken,
  mockSendRuntimeMessage,
} = accountAutoDetectionMocks

let autoDetectAccount: typeof import("~/services/accounts/accountAutoDetection").autoDetectAccount

beforeAll(async () => {
  const accountAutoDetection = await loadAccountAutoDetection()
  autoDetectAccount = accountAutoDetection.autoDetectAccount
})

describe("accountAutoDetection", () => {
  beforeEach(() => {
    resetAccountAutoDetectionMocks()
  })

  it("offers manual token completion for an unstructured token failure on any site", async () => {
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "42",
        user: { id: 42, username: "gemai-user" },
        siteType: SITE_TYPES.NEW_API,
      },
    })
    mockGetOrCreateAccessToken.mockRejectedValueOnce(
      new ApiError(
        "Unauthorized, insufficient privileges",
        200,
        "/api/user/token",
      ),
    )
    mockLoadBootstrapFacts.mockResolvedValueOnce({
      displayName: "Gemai",
      checkInSupported: false,
    })
    const result = await autoDetectAccount(
      "https://custom.example.invalid",
      AuthTypeEnum.AccessToken,
    )
    expect(result).toMatchObject({
      success: false,
      autoDetectFailureReason: "token_fetch_failed",
      detailedError: { type: "access_token_verification_required" },
      recoveryData: {
        siteType: SITE_TYPES.NEW_API,
        userId: "42",
        username: "gemai-user",
        authType: AuthTypeEnum.AccessToken,
      },
    })
  })

  it.each([
    {
      authType: AuthTypeEnum.AccessToken,
      status: 401,
      identityMismatch: false,
    },
    { authType: AuthTypeEnum.AccessToken, status: 403, identityMismatch: true },
    { authType: AuthTypeEnum.Cookie, status: 403, identityMismatch: false },
  ])(
    "keeps authentication and identity failures separate from manual token recovery: $authType $status $identityMismatch",
    async ({ authType, status, identityMismatch }) => {
      mockAutoDetectSmart.mockResolvedValueOnce({
        success: true,
        data: {
          userId: "42",
          user: { id: 42, username: "owner" },
          siteType: SITE_TYPES.NEW_API,
        },
      })
      const failure = new ApiError(
        "Account unavailable",
        status,
        "/api/user/self",
        identityMismatch
          ? API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH
          : undefined,
      )
      if (authType === AuthTypeEnum.Cookie)
        mockFetchUserInfo.mockRejectedValueOnce(failure)
      else mockGetOrCreateAccessToken.mockRejectedValueOnce(failure)
      mockLoadBootstrapFacts.mockResolvedValueOnce({ checkInSupported: false })
      const result = await autoDetectAccount(
        "https://custom.example.invalid",
        authType,
      )
      expect(result.success).toBe(false)
      expect(result.detailedError?.type).not.toBe(
        AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
      )
      expect(result.recoveryData?.authType).toBe(authType)
      if (identityMismatch)
        expect(result.autoDetectFailureReason).toBe(
          AUTO_DETECT_FAILURE_REASONS.AccountIdentityMismatch,
        )
    },
  )

  it.each([
    "SECURITY_PROOF_REQUIRED",
    "SECURITY_PROOF_INVALID",
    "SECURITY_PROOF_EXPIRED",
    "SECURITY_PROOF_CONSUMED",
  ])(
    "offers manual access-token recovery for New API %s",
    async (upstreamCode) => {
      mockAutoDetectSmart.mockResolvedValueOnce({
        success: true,
        data: {
          userId: "42",
          user: { id: 42, username: "new-api-user" },
          siteType: SITE_TYPES.NEW_API,
          transientAuth: {
            kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
            token: "private-dashboard-token",
            expiresAt: 4_102_444_800,
            sessionId: "private-session-id",
            origin: "https://panel.example.invalid",
          },
        },
      })
      mockGetOrCreateAccessToken.mockRejectedValueOnce(
        new ApiError(
          "upstream reflected private-dashboard-token",
          403,
          "/api/user/token",
          API_ERROR_CODES.HTTP_403,
          upstreamCode,
        ),
      )
      mockLoadBootstrapFacts.mockResolvedValueOnce({
        displayName: "New API portal",
        checkInSupported: false,
      })

      const result = await autoDetectAccount(
        "https://panel.example.invalid",
        AuthTypeEnum.Cookie,
      )

      expect(result).toMatchObject({
        success: false,
        autoDetectFailureReason: "access_token_verification_required",
        message: "accountDialog:accessTokenVerification.description",
        detailedError: {
          type: "access_token_verification_required",
          message: "accountDialog:accessTokenVerification.description",
        },
        recoveryData: {
          siteType: SITE_TYPES.NEW_API,
          userId: "42",
          username: "new-api-user",
          authType: AuthTypeEnum.AccessToken,
        },
      })
      expect(JSON.stringify(result)).not.toContain("upstream reflected")
      expect(
        JSON.stringify(snapshotOwnProperties(loggerMock.error.mock.calls)),
      ).not.toContain("private-dashboard-token")
    },
  )

  it.each([
    {
      siteType: SITE_TYPES.NEW_API,
      endpoint: "/api/user/token",
      upstreamCode: undefined,
    },
    {
      siteType: SITE_TYPES.NEW_API,
      endpoint: "/api/user/self",
      upstreamCode: "SECURITY_PROOF_REQUIRED",
    },
    {
      siteType: SITE_TYPES.VELOERA,
      endpoint: "/api/user/token",
      upstreamCode: "SECURITY_PROOF_REQUIRED",
    },
  ])(
    "offers manual recovery without changing the token failure reason: $siteType $endpoint $upstreamCode",
    async ({ siteType, endpoint, upstreamCode }) => {
      mockAutoDetectSmart.mockResolvedValueOnce({
        success: true,
        data: { userId: "42", siteType },
      })
      mockGetOrCreateAccessToken.mockRejectedValueOnce(
        new ApiError(
          "SECURITY_PROOF_REQUIRED mentioned in an unrelated error",
          403,
          endpoint,
          API_ERROR_CODES.HTTP_403,
          upstreamCode,
        ),
      )
      mockLoadBootstrapFacts.mockResolvedValueOnce({ checkInSupported: false })

      const result = await autoDetectAccount(
        "https://panel.example.invalid",
        AuthTypeEnum.AccessToken,
      )

      expect(result.autoDetectFailureReason).toBe(
        AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
      )
      expect(result.detailedError?.type).toBe(
        AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
      )
    },
  )

  it("retains rc22 dashboard credentials for local recovery without logging them", async () => {
    const dashboardToken = "dashboard-jwt-sensitive-example"
    const reflectedMessage = `upstream reflected ${dashboardToken}`
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "42",
        siteType: SITE_TYPES.NEW_API,
        transientAuth: {
          kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
          token: dashboardToken,
          expiresAt: 4_102_444_800,
          sessionId: "session-example",
          origin: "https://panel.example.invalid",
        },
      },
    })
    mockGetOrCreateAccessToken.mockRejectedValueOnce(
      new Error(reflectedMessage),
    )
    mockLoadBootstrapFacts.mockResolvedValueOnce({
      displayName: "rc22 portal",
      checkInSupported: false,
    })

    const result = await autoDetectAccount(
      "https://panel.example.invalid",
      AuthTypeEnum.Cookie,
      undefined,
      "session=private-cookie-example",
    )

    expect(result).toMatchObject({
      success: false,
      autoDetectFailureReason: AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
      detailedError: expect.objectContaining({
        type: AutoDetectErrorType.UNKNOWN,
      }),
      recoveryData: {
        siteType: SITE_TYPES.NEW_API,
        userId: "42",
        authType: AuthTypeEnum.Cookie,
        cookieAuthSessionCookie: "session=private-cookie-example",
        transientAuth: {
          kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
          token: dashboardToken,
          expiresAt: 4_102_444_800,
          sessionId: "session-example",
          origin: "https://panel.example.invalid",
        },
      },
    })
    expect(JSON.stringify(result)).not.toContain(reflectedMessage)
    expect(loggerMock.error).toHaveBeenCalledTimes(1)
    const logged = atIndex(loggerMock.error.mock.calls, 0)
    const logMessage = atIndex(logged, 0)
    const logError = atIndex(logged, 1)
    expect(String(logMessage)).not.toContain(dashboardToken)
    expect(String(logMessage)).not.toContain(reflectedMessage)
    expect(logError).toMatchObject({
      message: "New API dashboard authentication could not be exchanged",
      cause: {
        message: "New API dashboard authentication could not be exchanged",
      },
    })
    const serializedLogError = JSON.stringify(snapshotOwnProperties(logError))
    expect(serializedLogError).not.toContain(dashboardToken)
    expect(serializedLogError).not.toContain(reflectedMessage)
  })

  it("keeps user-ID recovery guidance when all detection sources return no identity", async () => {
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: false,
      error: "messages:operations.detection.getUserIdFailed",
    })
    const result = await autoDetectAccount(
      "https://example.com",
      AuthTypeEnum.Cookie,
    )
    expect(result).toMatchObject({
      success: false,
      message: "messages:operations.detection.getUserIdFailedDetailed",
      detailedError: { type: AutoDetectErrorType.INVALID_RESPONSE },
    })
    expect(mockGetOrCreateAccessToken).not.toHaveBeenCalled()
  })

  it("returns a get-user-id failure when detection succeeds without a user id", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        siteType: "new-api",
      },
    })

    const result = await autoDetectAccount(
      "https://example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result).toMatchObject({
      success: false,
      message: "messages:operations.detection.getUserIdFailedDetailed",
      autoDetectFailureReason: AUTO_DETECT_FAILURE_REASONS.UserIdMissing,
      detailedError: expect.objectContaining({
        type: AutoDetectErrorType.INVALID_RESPONSE,
      }),
    })
  })

  it("retains token data obtained before a later completion probe fails", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "11",
        user: { id: 11 },
        siteType: SITE_TYPES.AIHUBMIX,
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "recovered-user",
      access_token: "recovered-token",
    })
    mockLoadBootstrapFacts.mockRejectedValueOnce(
      new Error("status unavailable"),
    )

    const result = await autoDetectAccount(
      "https://aihubmix.com",
      AuthTypeEnum.Cookie,
    )

    expect(result).toMatchObject({
      success: false,
      autoDetectFailureReason:
        AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed,
      recoveryData: {
        siteType: SITE_TYPES.AIHUBMIX,
        userId: "11",
        username: "recovered-user",
        accessToken: "recovered-token",
        authType: AuthTypeEnum.AccessToken,
      },
    })
  })

  it("fails AIHubMix auto-detect when the detected user has no username", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "11",
        user: { id: 11 },
        siteType: SITE_TYPES.AIHUBMIX,
        accessToken: "detected-console-token",
      },
    })
    mockLoadBootstrapFacts.mockResolvedValueOnce({
      displayName: "AIHubMix",
    })
    mockFetchSupportCheckIn.mockResolvedValueOnce(false)

    const result = await autoDetectAccount(
      "https://aihubmix.com",
      AuthTypeEnum.Cookie,
    )

    expect(result).toMatchObject({
      success: false,
      message: "messages:operations.detection.getUsernameFailedDetailed",
      autoDetectFailureReason: AUTO_DETECT_FAILURE_REASONS.UsernameMissing,
      detailedError: expect.objectContaining({
        type: AutoDetectErrorType.INVALID_RESPONSE,
      }),
    })
    expect(mockGetOrCreateAccessToken).not.toHaveBeenCalled()
    expect(mockFetchUserInfo).not.toHaveBeenCalled()
  })

  it("fails AIHubMix auto-detect when token retrieval returns no token", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "11",
        user: { id: 11, username: "aihubmix-user" },
        siteType: SITE_TYPES.AIHUBMIX,
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "aihubmix-user",
      access_token: "",
    })
    mockLoadBootstrapFacts.mockResolvedValueOnce({ displayName: "AIHubMix" })
    mockFetchSupportCheckIn.mockResolvedValueOnce(false)

    const result = await autoDetectAccount(
      "https://aihubmix.com",
      AuthTypeEnum.Cookie,
    )

    expect(result).toMatchObject({
      success: false,
      message: "accountDialog:accessTokenVerification.description",
      autoDetectFailureReason: AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
      detailedError: expect.objectContaining({
        type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
      }),
    })
  })

  it("returns a get-info failure when access-token auth cannot obtain a usable token", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "5",
        siteType: "new-api",
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "missing-token-user",
      access_token: "",
    })
    mockLoadBootstrapFacts.mockResolvedValueOnce({
      displayName: "Missing Token Portal",
    })
    mockFetchSupportCheckIn.mockResolvedValueOnce(false)

    const result = await autoDetectAccount(
      "https://token.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result).toMatchObject({
      success: false,
      message: "accountDialog:accessTokenVerification.description",
      autoDetectFailureReason: AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
      detailedError: expect.objectContaining({
        type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
      }),
    })
  })

  it("returns local guidance when site status cannot be fetched", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "5",
        siteType: SITE_TYPES.NEW_API,
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "status-user",
      access_token: "status-token",
    })
    mockLoadBootstrapFacts.mockRejectedValueOnce(
      new Error("site status unavailable"),
    )

    const result = await autoDetectAccount(
      "https://status.example.invalid",
      AuthTypeEnum.AccessToken,
    )

    expect(result).toMatchObject({
      success: false,
      message: "messages:operations.detection.getSiteStatusFailedDetailed",
      autoDetectFailureReason:
        AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed,
    })
    expect(mockFetchSupportCheckIn).not.toHaveBeenCalled()
  })

  it("classifies token creation exceptions during auto-detect completion", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "5",
        siteType: SITE_TYPES.NEW_API,
      },
    })
    mockGetOrCreateAccessToken.mockRejectedValueOnce(
      new Error("private token backend text"),
    )
    mockLoadBootstrapFacts.mockResolvedValueOnce({
      displayName: "Token Failure Portal",
    })
    mockFetchSupportCheckIn.mockResolvedValueOnce(false)

    const result = await autoDetectAccount(
      "https://token-failure.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result).toMatchObject({
      success: false,
      autoDetectFailureReason: AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
      detailedError: expect.objectContaining({
        type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
      }),
    })
  })

  it("retains a New API token when the concurrent site-status probe fails", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "5",
        siteType: SITE_TYPES.NEW_API,
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "parallel-recovered-user",
      access_token: "parallel-recovered-token",
    })
    mockLoadBootstrapFacts.mockRejectedValueOnce(
      new Error("status unavailable"),
    )

    const result = await autoDetectAccount(
      "https://parallel.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result).toMatchObject({
      success: false,
      autoDetectFailureReason:
        AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed,
      recoveryData: {
        siteType: SITE_TYPES.NEW_API,
        userId: "5",
        username: "parallel-recovered-user",
        accessToken: "parallel-recovered-token",
        authType: AuthTypeEnum.AccessToken,
      },
    })
  })

  it("waits for a slower New API token probe before returning a site-status failure", async () => {
    const tokenDeferred = createDeferred<{
      username: string
      access_token: string
    }>()
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "5",
        siteType: SITE_TYPES.NEW_API,
      },
    })
    mockGetOrCreateAccessToken.mockReturnValueOnce(tokenDeferred.promise)
    mockLoadBootstrapFacts.mockRejectedValueOnce(
      new Error("status unavailable"),
    )

    const resultPromise = autoDetectAccount(
      "https://parallel.example.com",
      AuthTypeEnum.AccessToken,
    )

    await vi.waitFor(() => {
      expect(mockGetOrCreateAccessToken).toHaveBeenCalledOnce()
    })
    tokenDeferred.resolve({
      username: "slower-recovered-user",
      access_token: "slower-recovered-token",
    })
    const result = await resultPromise

    expect(result).toMatchObject({
      success: false,
      autoDetectFailureReason:
        AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed,
      recoveryData: {
        siteType: SITE_TYPES.NEW_API,
        userId: "5",
        username: "slower-recovered-user",
        accessToken: "slower-recovered-token",
        authType: AuthTypeEnum.AccessToken,
      },
    })
  })

  it("continues auto-detect when check-in support probing fails", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "7",
        siteType: SITE_TYPES.NEW_API,
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "checkin-fallback-user",
      access_token: "checkin-fallback-token",
    })
    mockLoadBootstrapFacts.mockResolvedValueOnce({
      displayName: "Checkin Fallback Portal",
    })
    mockFetchSupportCheckIn.mockRejectedValueOnce(
      new Error("private check-in backend text"),
    )

    const result = await autoDetectAccount(
      "https://checkin-fallback.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      username: "checkin-fallback-user",
      accessToken: "checkin-fallback-token",
      checkIn: expect.objectContaining({
        automaticExecutionEnabled: true,
        methodKnowledge: { methods: {} },
        selection: { mode: "automatic" },
      }),
    })
  })
})
