import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { aimlApiAccountPersistence } from "~/services/apiAdapters/aimlapi/accountPersistence"
import { server } from "~~/tests/msw/server"

describe("AI/ML API credential validation", () => {
  it("rejects an invalid primary credential even when the supplemental billing key works", async () => {
    server.use(
      http.get("https://api.aimlapi.com/v1/key", () =>
        HttpResponse.json({ message: "invalid" }, { status: 401 }),
      ),
      http.get("https://api.aimlapi.com/v2/billing/detail", () =>
        HttpResponse.json({
          user_id: 123,
          email: "user@example.invalid",
          current_balance: 4,
          currency: "USD",
        }),
      ),
    )
    await expect(
      aimlApiAccountPersistence.prepareIdentity!({
        accessToken: "invalid-management",
        aimlApiKey: "valid-regular",
        userId: "",
      } as never),
    ).rejects.toMatchObject({ statusCode: 401 })
  })
})
