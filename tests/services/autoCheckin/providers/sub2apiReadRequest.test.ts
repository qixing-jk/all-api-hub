import { afterEach, describe, expect, it, vi } from "vitest"

import * as browserAuth from "~/services/apiService/sub2api/auth/browserAuth"
import {
  API_DIRECT_REQUEST_REASONS,
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
