import { afterEach, describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { ACCOUNT_BROWSER_SESSION_SOURCES } from "~/services/accountBrowserSession/types"
import * as browserAuth from "~/services/apiService/sub2api/auth/browserAuth"
import * as transport from "~/services/apiTransport/request"
import {
  API_DIRECT_REQUEST_REASONS,
  API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES,
  API_TRANSPORT_FETCH_CONTEXT_KINDS,
  type ApiServiceRequest,
} from "~/services/apiTransport/type"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import { createSub2ApiCheckInReadRequest } from "~/services/checkin/autoCheckin/providers/sub2apiShared"
import {
  PROTECTION_BYPASS_AUTOMATIC_FEATURES,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
} from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { automaticExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

const request: ApiServiceRequest = {
  baseUrl: "https://sub2api.example.invalid",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "fixture-access",
    userId: "42",
  },
  directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
}

describe("Sub2API check-in read request", () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([
    {
      method: AUTO_CHECKIN_METHOD_IDS.XingchiDailyCheckIn,
      status: {
        code: 0,
        message: "ok",
        data: { enabled: true, claimed_today: false },
      },
    },
    {
      method: AUTO_CHECKIN_METHOD_IDS.DenxioDailyCheckIn,
      status: {
        code: 0,
        message: "ok",
        data: { normal_done: false, config: { normal_checkin_enabled: true } },
      },
      begin: {
        code: 0,
        message: "ok",
        data: { token: "challenge", wait_seconds: 0 },
      },
    },
    {
      method: AUTO_CHECKIN_METHOD_IDS.AiRouterDailyCheckIn,
      status: JSON.stringify({
        code: 0,
        message: "ok",
        data: { enabled: true, checked_today: false },
      }),
    },
    {
      method: AUTO_CHECKIN_METHOD_IDS.XiaobaiCodeDailyCheckIn,
      status: JSON.stringify({
        ok: true,
        data: { signedToday: false, config: { enabled: true } },
      }),
    },
  ])(
    "keeps $method submission on the browser session admitted by the first GET",
    async ({ method, status, begin }) => {
      const context = {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
        protectionBypassExecution: automaticExecution(
          PROTECTION_BYPASS_AUTOMATIC_FEATURES.Checkin,
          PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
        ),
      }
      const fetchContext = {
        kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
        tabId: 12,
        origin: request.baseUrl,
      } as const
      const recover = vi
        .spyOn(browserAuth, "recoverSub2ApiBrowserAuth")
        .mockResolvedValue({
          source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
          accessToken: "fresh",
          userId: "42",
          fetchContext,
        })
      const rejected = { code: "SESSION_BINDING_MISMATCH" }
      const unauthorized = {
        ok: false,
        status: 401,
        headers: {},
        body: typeof status === "string" ? JSON.stringify(rejected) : rejected,
      }
      const fetch = vi
        .spyOn(transport, "fetchApiResponse")
        .mockResolvedValueOnce(unauthorized)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: {},
          body: status,
        })
      if (begin)
        fetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: {},
          body: begin,
        })
      fetch.mockResolvedValue(unauthorized)
      const execution =
        autoCheckinMethodRegistry.resolveById(method)!.provider.forExecution!(
          context,
        )
      const proof = await execution.getAuthenticatedStatus({
        request: {
          ...request,
          auth: { ...request.auth, refreshToken: "refresh" },
        },
        observedAt: Date.now(),
      })
      if (proof?.outcome !== "known") throw new Error("Expected known status")
      const account = buildSiteAccount({ site_url: request.baseUrl })
      const result = await execution.checkIn(account, {
        ...context,
        statusProof: proof,
      })
      expect(result).toMatchObject({
        status: "failed",
        reasonCode: "authentication_required",
      })
      expect(recover).toHaveBeenCalledOnce()
      expect(
        fetch.mock.calls.map(([, options]) => options.options?.method),
      ).toEqual(
        begin
          ? ["GET", "GET", "POST", "POST"]
          : [
              "GET",
              "GET",
              "POST",
              ...(method === AUTO_CHECKIN_METHOD_IDS.XingchiDailyCheckIn
                ? ["GET"]
                : []),
            ],
      )
      for (const [pending] of fetch.mock.calls.slice(1)) {
        expect(pending).toMatchObject({
          fetchContext,
          currentTabFallback: API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES.Forbid,
        })
      }
    },
  )

  it.each(["denxio:daily-checkin", "ai-router:daily-checkin"] as const)(
    "keeps %s discovery passive when a saved access token is missing",
    async (methodId) => {
      const recover = vi
        .spyOn(browserAuth, "recoverSub2ApiBrowserAuth")
        .mockResolvedValue(null)
      const detection = await autoCheckinMethodRegistry
        .resolveById(methodId)
        ?.provider.detect?.({
          request: { ...request, auth: { ...request.auth, accessToken: "" } },
          observedAt: 1,
        })
      expect(detection).toMatchObject({
        outcome: "unknown",
        reason: "authentication_required",
      })
      expect(recover).not.toHaveBeenCalled()
    },
  )
  it("preserves passive reads and their cancellation", () => {
    const signal = new AbortController().signal
    expect(
      createSub2ApiCheckInReadRequest({ request, signal, observedAt: 1 }),
    ).toEqual({ ...request, abortSignal: signal })
  })

  it("binds only execution admission to its existing background protection policy", () => {
    const authenticationRecovery = {
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
      protectionBypassExecution: automaticExecution(
        PROTECTION_BYPASS_AUTOMATIC_FEATURES.Checkin,
        PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
      ),
    }
    const signal = new AbortController().signal
    expect(
      createSub2ApiCheckInReadRequest(
        { request, signal, observedAt: 1 },
        authenticationRecovery,
      ),
    ).toEqual({
      ...request,
      ...authenticationRecovery,
      abortSignal: signal,
      directRequestReason: undefined,
    })
  })
})
