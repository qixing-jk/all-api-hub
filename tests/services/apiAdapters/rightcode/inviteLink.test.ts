import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { rightCodeInviteLink } from "~/services/apiAdapters/rightcode/inviteLink"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

const baseUrl = "https://right-code.example.invalid"

const createRequest = () => ({
  baseUrl,
  accountId: "account-example",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "account-token",
  },
})

const respondWithInviteCode = (inviteCode: unknown) => {
  server.use(
    http.get(`${baseUrl}/auth/me`, () =>
      HttpResponse.json({
        id: 7,
        username: "example-user",
        user_token: "account-token",
        invite_code: inviteCode,
      }),
    ),
  )
}

describe("rightCodeInviteLink", () => {
  it("builds the invitation from the account's own origin and code", async () => {
    respondWithInviteCode("690a8be5")

    await expect(
      rightCodeInviteLink.fetchInviteLink({ request: createRequest() }),
    ).resolves.toBe("https://right-code.example.invalid/register?aff=690a8be5")
  })

  it("encodes a code that needs escaping", async () => {
    respondWithInviteCode("a+b/c")

    await expect(
      rightCodeInviteLink.fetchInviteLink({ request: createRequest() }),
    ).resolves.toBe("https://right-code.example.invalid/register?aff=a%2Bb%2Fc")
  })

  it("reports missing invite data instead of an unusable link", async () => {
    respondWithInviteCode(null)

    await expect(
      rightCodeInviteLink.fetchInviteLink({ request: createRequest() }),
    ).rejects.toMatchObject({ reason: "invite_data_missing" })
  })
})
