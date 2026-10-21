import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { dahlKeyResources } from "~/services/apiAdapters/dahl/keyResources"
import { dahlModelPricing } from "~/services/apiAdapters/dahl/modelPricing"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

const origin = "https://inference.dahl.global"
const request = {
  accountId: "acc-dahl",
  baseUrl: origin,
  auth: {
    authType: AuthTypeEnum.Cookie,
    userId: "3f2b9c1e-8a7d-4c6e-9b0f-1d2e3f4a5b6c",
  },
} satisfies ApiServiceRequest

const openSession = () =>
  dahlKeyResources.open({
    account: { id: "acc-dahl", name: "Dahl", siteType: "dahl" },
    request,
  })

it("reports Dahl's published flat rate as a published rate instead of a group estimate", async () => {
  server.use(
    http.get(`${origin}/v1/models`, () =>
      HttpResponse.json({ data: [{ id: "test-model" }] }),
    ),
  )
  const snapshot = await dahlModelPricing.fetchPricing(request)
  expect(snapshot.data[0]).toMatchObject({
    token_price_usd_per_million: {
      input: 0.03,
      output: 0.03,
      cache_read: 0.03,
    },
    price_metadata: { source: "provider-catalog", precision: "exact" },
  })
})

describe("Dahl key resources", () => {
  it("surfaces a create rejection instead of an uncertain state", async () => {
    installCookieTransport("dahl_session", origin.replace("https://", ""))
    server.use(
      http.get(`${origin}/v1/account`, () =>
        HttpResponse.json({
          user: {
            user_id: "3f2b9c1e-8a7d-4c6e-9b0f-1d2e3f4a5b6c",
            username: "Work",
          },
        }),
      ),
      http.get(`${origin}/v1/account/keys`, () =>
        HttpResponse.json({ keys: [] }),
      ),
      http.post(`${origin}/v1/account/keys`, () =>
        HttpResponse.json({ message: "key limit reached" }, { status: 409 }),
      ),
    )
    const editor = await (await openSession()).openCreateEditor("default")
    await expect(editor.submit({ name: "new-key" })).rejects.toMatchObject({
      failure: { code: "upstream_rejected" },
    })
  })
})
