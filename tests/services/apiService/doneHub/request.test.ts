import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { doneHubRequests } from "~/services/apiService/doneHub/request"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

const baseUrl = "https://done-hub.example.invalid"
const request = {
  baseUrl,
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
}

describe("doneHubRequests", () => {
  it("owns DoneHub channel error envelopes at the request seam", async () => {
    server.use(
      http.get(`${baseUrl}/api/channel/1`, () =>
        HttpResponse.json({
          success: false,
          message: "Channel configuration was rejected",
        }),
      ),
    )

    await expect(
      doneHubRequests.data(request, { endpoint: "/api/channel/1" }),
    ).rejects.toMatchObject({
      message: "Channel configuration was rejected",
      code: API_ERROR_CODES.BUSINESS_ERROR,
    })
  })
})
