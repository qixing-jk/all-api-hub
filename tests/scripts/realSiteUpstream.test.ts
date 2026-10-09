import { describe, expect, it } from "vitest"

import { resolveRealSiteUpstream } from "~~/scripts/utils/real-site-upstream.mjs"

describe("shared real-site upstream credentials", () => {
  it("uses only the explicit upstream URL and API key, preserving a mount path", () => {
    expect(
      resolveRealSiteUpstream({
        AAH_E2E_UPSTREAM_BASE_URL: " https://upstream.example/proxy/v1/ ",
        AAH_E2E_UPSTREAM_API_KEY: " sk-test ",
      }),
    ).toEqual({
      config: {
        baseUrl: "https://upstream.example/proxy/v1",
        apiKey: "sk-test",
      },
      missingEnvKeys: [],
    })
  })

  it("does not infer inference credentials from New API account or admin credentials", () => {
    expect(
      resolveRealSiteUpstream({
        AAH_E2E_NEW_API_BASE_URL: "https://account.example",
        AAH_E2E_NEW_API_ADMIN_TOKEN: "admin-test",
        AAH_E2E_NEW_API_USERNAME: "user",
        AAH_E2E_NEW_API_PASSWORD: "password",
      }),
    ).toEqual({
      config: null,
      missingEnvKeys: ["AAH_E2E_UPSTREAM_BASE_URL", "AAH_E2E_UPSTREAM_API_KEY"],
    })
  })

  it("reports a missing key without exposing other configuration values", () => {
    expect(
      resolveRealSiteUpstream({
        AAH_E2E_UPSTREAM_BASE_URL: "https://upstream.example",
      }),
    ).toEqual({ config: null, missingEnvKeys: ["AAH_E2E_UPSTREAM_API_KEY"] })
  })

  it.each(["file:///tmp/test", "not-a-url", "https://user:secret@example.com"])(
    "rejects an unsafe or malformed source URL",
    (baseUrl) => {
      expect(() =>
        resolveRealSiteUpstream({
          AAH_E2E_UPSTREAM_BASE_URL: baseUrl,
          AAH_E2E_UPSTREAM_API_KEY: "private-key",
        }),
      ).toThrow(
        "AAH_E2E_UPSTREAM_BASE_URL must be an HTTP(S) URL without embedded credentials",
      )
    },
  )
})
