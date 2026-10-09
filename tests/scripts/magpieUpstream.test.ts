import { bypass } from "msw"
import { describe, expect, it } from "vitest"

import {
  MAGPIE_TEST_MODELS,
  resolveMagpieUpstream,
} from "~~/scripts/suites/magpie/upstream.mjs"

describe("Magpie model discovery source", () => {
  it("uses the shared real inference credential unchanged for a remote gateway", async () => {
    const source = await resolveMagpieUpstream("https://gateway.example", {
      AAH_E2E_UPSTREAM_BASE_URL: "https://inference.example/proxy/v1",
      AAH_E2E_UPSTREAM_API_KEY: "sk-source",
    })
    expect(source.config).toEqual({
      baseUrl: "https://inference.example/proxy/v1",
      apiKey: "sk-source",
    })
    await source.close()
  })

  it("starts an authenticated local model fixture only when no shared source is configured", async () => {
    const source = await resolveMagpieUpstream("http://localhost:3430", {})
    try {
      expect(source.config).not.toBeNull()
      const url = `${source.config!.baseUrl}/models`
      expect((await fetch(bypass(url))).status).toBe(401)
      const response = await fetch(
        bypass(url, {
          headers: { Authorization: `Bearer ${source.config!.apiKey}` },
        }),
      )
      expect(response.status).toBe(200)
      expect(
        (await response.json()).data.map((m: { id: string }) => m.id),
      ).toEqual(MAGPIE_TEST_MODELS)
    } finally {
      await source.close()
    }
  })

  it("never offers a localhost source to a remote gateway", async () => {
    const source = await resolveMagpieUpstream("https://gateway.example", {})
    expect(source.config).toBeNull()
    await source.close()
  })

  it("does not hide a partially configured shared credential with a local fixture", async () => {
    const source = await resolveMagpieUpstream("http://localhost:3430", {
      AAH_E2E_UPSTREAM_BASE_URL: "https://inference.example",
    })
    expect(source.config).toBeNull()
    await source.close()
  })
})
