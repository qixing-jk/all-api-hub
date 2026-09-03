import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

const baseUrl = "https://new-api.example.invalid"
const request = {
  baseUrl,
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
}

describe("newApiFamilyRequests", () => {
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
