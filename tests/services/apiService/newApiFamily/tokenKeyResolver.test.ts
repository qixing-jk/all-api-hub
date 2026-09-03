import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { fetchTokenSecretKeyById } from "~/services/apiService/newApiFamily/default/tokenKeyResolver"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

const baseUrl = "https://new-api.example.invalid"
const request = {
  baseUrl,
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
}

describe("New API token secret resolution", () => {
  it("uses POST and unwraps the documented secret response", async () => {
    let method = ""
    server.use(
      http.post(`${baseUrl}/api/token/7/key`, ({ request }) => {
        method = request.method
        return HttpResponse.json({
          success: true,
          message: "",
          data: { key: "secret-placeholder" },
        })
      }),
    )

    await expect(fetchTokenSecretKeyById(request, 7)).resolves.toBe(
      "secret-placeholder",
    )
    expect(method).toBe("POST")
  })

  it("preserves a documented HTTP 200 business error", async () => {
    server.use(
      http.post(`${baseUrl}/api/token/8/key`, () =>
        HttpResponse.json({
          success: false,
          message: "Token does not exist",
        }),
      ),
    )

    await expect(fetchTokenSecretKeyById(request, 8)).rejects.toMatchObject({
      message: "Token does not exist",
      code: API_ERROR_CODES.BUSINESS_ERROR,
    })
  })

  it("preserves the documented auth code on an HTTP error", async () => {
    server.use(
      http.post(`${baseUrl}/api/token/9/key`, () =>
        HttpResponse.json(
          {
            success: false,
            code: "AUTH_TOKEN_INVALID",
            message: "Access token is invalid",
          },
          { status: 401 },
        ),
      ),
    )

    await expect(fetchTokenSecretKeyById(request, 9)).rejects.toMatchObject({
      message: "Access token is invalid",
      statusCode: 401,
      code: API_ERROR_CODES.HTTP_401,
      upstreamCode: "AUTH_TOKEN_INVALID",
    })
  })

  it("uses the fixed transport fallback for an empty 429", async () => {
    server.use(
      http.post(
        `${baseUrl}/api/token/10/key`,
        () =>
          new HttpResponse(null, {
            status: 429,
            headers: { "Retry-After": "60" },
          }),
      ),
    )

    await expect(fetchTokenSecretKeyById(request, 10)).rejects.toMatchObject({
      message: "请求失败: 429",
      statusCode: 429,
      code: API_ERROR_CODES.HTTP_429,
    })
  })
})
