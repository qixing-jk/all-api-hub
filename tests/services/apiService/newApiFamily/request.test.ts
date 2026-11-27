import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import type { executeWithAccountCredentialRecovery } from "~/services/accountCredentialRecovery"
import { fetchCurrentUserGroup } from "~/services/apiService/newApiFamily/default/keyManagement"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { triggerFreeggDailyAllowance } from "~/services/apiService/newApiFamily/variants/freeggDailyAllowance"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

vi.mock("~/services/accountCredentialRecovery", () => ({
  executeWithAccountCredentialRecovery: vi.fn<
    typeof executeWithAccountCredentialRecovery
  >(async (request, run) => {
    try {
      return await run(request)
    } catch {
      return run({
        ...request,
        auth: { ...request.auth, accessToken: "renewed" },
      })
    }
  }),
}))

const baseUrl = "https://new-api.example.invalid"
const request = {
  directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
  baseUrl,
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
}

describe("newApiFamilyRequests", () => {
  it("allows ordinary FreeGG group lookups to recover expired credentials", async () => {
    const authorizations: (string | null)[] = []
    server.use(
      http.get("https://freegg.app/api/user/self", ({ request }) => {
        const authorization = request.headers.get("Authorization")
        authorizations.push(authorization)
        return authorization === "Bearer renewed"
          ? HttpResponse.json({ success: true, data: { group: "default" } })
          : HttpResponse.json(
              { success: false, message: "Expired" },
              { status: 401 },
            )
      }),
    )

    await expect(
      fetchCurrentUserGroup({
        ...request,
        baseUrl: "https://freegg.app",
        allowAccountCredentialRecovery: true,
      }),
    ).resolves.toBe("default")
    expect(authorizations).toEqual(["Bearer token", "Bearer renewed"])
  })

  it("keeps credential recovery out of an explicit FreeGG allowance request", async () => {
    let requestCount = 0
    server.use(
      http.get("https://freegg.app/api/user/self", () => {
        requestCount++
        return HttpResponse.json(
          { success: false, message: "Expired" },
          { status: 401 },
        )
      }),
    )

    await expect(
      triggerFreeggDailyAllowance({
        ...request,
        baseUrl: "https://freegg.app",
        allowAccountCredentialRecovery: true,
      }),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(requestCount).toBe(1)
  })

  it("owns New API authentication errors at the request seam", async () => {
    server.use(
      http.get(`${baseUrl}/api/user/self`, () =>
        HttpResponse.json(
          {
            success: false,
            code: "AUTH_SESSION_LIMIT",
            message: "Active session limit reached",
          },
          { status: 401 },
        ),
      ),
    )

    await expect(
      newApiFamilyRequests.data(request, { endpoint: "/api/user/self" }),
    ).rejects.toMatchObject({
      message: "Active session limit reached",
      statusCode: 401,
      code: API_ERROR_CODES.HTTP_401,
      upstreamCode: "AUTH_SESSION_LIMIT",
    })
  })

  it("keeps successful HTTP envelopes when the caller owns classification", async () => {
    server.use(
      http.post(`${baseUrl}/api/user/checkin`, () =>
        HttpResponse.json({ success: false, message: "Already checked in" }),
      ),
    )

    await expect(
      newApiFamilyRequests.envelope(request, {
        endpoint: "/api/user/checkin",
        options: { method: "POST" },
      }),
    ).resolves.toEqual({ success: false, message: "Already checked in" })
  })

  it("unwraps envelopes in payload mode", async () => {
    server.use(
      http.get(`${baseUrl}/api/pricing`, () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: { model: "example-model" },
        }),
      ),
    )

    await expect(
      newApiFamilyRequests.payload(request, { endpoint: "/api/pricing" }),
    ).resolves.toEqual({ model: "example-model" })
  })
})
