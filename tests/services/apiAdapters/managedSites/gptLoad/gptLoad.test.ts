import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import { gptLoadManagedSiteCapabilities as capabilities } from "~/services/apiAdapters/managedSites/gptLoad"
import { server } from "~~/tests/msw/server"

const config = {
  baseUrl: "https://gpt-load.example.invalid",
  managementKey: "fake-key",
}
const envelope = (data: unknown) => HttpResponse.json({ code: 0, data })

describe("gpt-load managed-site queries and matching", () => {
  it("returns actual model IDs rather than driver IDs", async () => {
    server.use(
      http.get(`${config.baseUrl}/api/models`, () =>
        envelope({ items: [{ client_model: "gpt-4o" }] }),
      ),
    )
    expect(
      await capabilities.queries.accountAvailableModels!.fetch(config),
    ).toEqual(["gpt-4o"])
  })

  it("matches exact overrides and first-party defaults without leaking secrets", async () => {
    server.use(
      http.get(`${config.baseUrl}/api/modern/groups`, () =>
        envelope({
          items: [
            {
              id: 1,
              name: "Default",
              channel_id: "openai",
              credentials: { api_key: "secret" },
            },
            {
              id: 2,
              name: "Override",
              channel_id: "openai_compatible",
              endpoint: "https://relay.invalid/v1/",
              model_names: ["gpt-model"],
            },
            {
              id: 3,
              name: "Wrong",
              channel_id: "openai_compatible",
              params: { base_url: "https://relay.invalid/v1/extra" },
            },
          ],
        }),
      ),
    )
    const relay = await capabilities.matching.search(
      config,
      "https://relay.invalid/v1",
    )
    expect(relay!.items).toHaveLength(1)
    expect(relay!.items[0]).toMatchObject({
      name: "Override",
      key: "",
      models: "gpt-model",
    })
    expect(
      (await capabilities.matching.search(config, "https://api.openai.com/v1"))!
        .items,
    ).toHaveLength(1)
  })

  it("reveals a pool only after the resource scope is verified", async () => {
    server.use(
      http.get(`${config.baseUrl}/api/groups/1/credentials`, () =>
        envelope({ items: [{ credential_id: 4 }] }),
      ),
      http.post(`${config.baseUrl}/api/groups/1/credentials/4/reveal`, () =>
        envelope({ credential: { api_key: "sk-real" } }),
      ),
    )
    const ref = {
      siteType: SITE_TYPES.GPT_LOAD,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      scopeKey: config.baseUrl,
      resourceId: "1",
    }
    expect(await capabilities.matching.fetchSecretKey!(config, ref)).toBe(
      "sk-real",
    )
    await expect(
      capabilities.matching.fetchSecretKey!(config, {
        ...ref,
        scopeKey: "https://elsewhere.invalid",
      }),
    ).rejects.toThrow()
  })
})
