import { describe, expect, it } from "vitest"

import {
  API_DIRECT_REQUEST_REASONS,
  type ApiServiceRequest,
} from "~/services/apiTransport/type"
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
      createSub2ApiCheckInReadRequest({
        request,
        signal,
        authenticationRecovery,
        observedAt: 1,
      }),
    ).toEqual({
      ...request,
      ...authenticationRecovery,
      abortSignal: signal,
      directRequestReason: undefined,
    })
  })
})
