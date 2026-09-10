import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { veloeraRequests } from "~/services/apiService/veloera/request"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

const baseUrl = "https://veloera.example.invalid"
const request = {
  baseUrl,
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
}

describe("veloeraRequests", () => {
  it("owns Veloera channel error envelopes at the request seam", async () => {
    server.use(
      http.get(`${baseUrl}/api/channel/1`, () =>
        HttpResponse.json({
          success: false,
          message: "Channel configuration was rejected",
        }),
      ),
    )

    await expect(
      veloeraRequests.data(request, { endpoint: "/api/channel/1" }),
    ).rejects.toMatchObject({
      message: "Channel configuration was rejected",
      code: API_ERROR_CODES.BUSINESS_ERROR,
    })
  })

  it("uses the fixed fallback for Veloera's empty rate-limit response", async () => {
    server.use(
      http.get(
        `${baseUrl}/api/channel/1`,
        () => new HttpResponse(null, { status: 429 }),
      ),
    )

    await expect(
      veloeraRequests.data(request, { endpoint: "/api/channel/1" }),
    ).rejects.toMatchObject({
      message: "请求失败: 429",
      statusCode: 429,
      code: API_ERROR_CODES.HTTP_429,
    })
  })
})
