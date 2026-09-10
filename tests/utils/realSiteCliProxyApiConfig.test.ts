import { afterEach, describe, expect, it, vi } from "vitest"

import { resolveCliProxyApiConfig } from "~~/e2e/utils/realSite/managedSiteConfig"

afterEach(() => vi.unstubAllEnvs())

describe("CLIProxyAPI real-site configuration", () => {
  it("requires the management key and reports missing environment names", () => {
    vi.stubEnv("AAH_E2E_CLI_PROXY_API_BASE_URL", "http://localhost:8317")
    vi.stubEnv("AAH_E2E_CLI_PROXY_API_ADMIN_TOKEN", "")
    expect(resolveCliProxyApiConfig()).toEqual({
      config: null,
      missingEnvKeys: ["AAH_E2E_CLI_PROXY_API_ADMIN_TOKEN"],
    })
  })

  it("preserves HTTP and reverse-proxy management paths", () => {
    vi.stubEnv(
      "AAH_E2E_CLI_PROXY_API_BASE_URL",
      " http://localhost:8317/proxy/v0/management ",
    )
    vi.stubEnv("AAH_E2E_CLI_PROXY_API_ADMIN_TOKEN", " test-management-key ")
    expect(resolveCliProxyApiConfig()).toEqual({
      config: {
        baseUrl: "http://localhost:8317/proxy/v0/management",
        adminToken: "test-management-key",
      },
      missingEnvKeys: [],
    })
  })
})
