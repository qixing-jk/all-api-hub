import { afterEach, describe, expect, it, vi } from "vitest"

import { resolveSub2ApiManagedSiteConfig } from "~~/e2e/utils/realSite/managedSiteConfig"

describe("Sub2API managed-site real-site config", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("uses only the deployment URL and Admin API Key", () => {
    vi.stubEnv("AAH_E2E_SUB2API_BASE_URL", " https://sub2api.example.invalid ")
    vi.stubEnv("AAH_E2E_SUB2API_ADMIN_TOKEN", " admin-api-key ")

    expect(resolveSub2ApiManagedSiteConfig()).toEqual({
      config: {
        baseUrl: "https://sub2api.example.invalid",
        adminToken: "admin-api-key",
      },
      missingEnvKeys: [],
    })
  })

  it("reports the missing Admin API Key independently from account login", () => {
    vi.stubEnv("AAH_E2E_SUB2API_BASE_URL", "https://sub2api.example.invalid")
    vi.stubEnv("AAH_E2E_SUB2API_ADMIN_TOKEN", "")

    expect(resolveSub2ApiManagedSiteConfig()).toEqual({
      config: null,
      missingEnvKeys: ["AAH_E2E_SUB2API_ADMIN_TOKEN"],
    })
  })
})
