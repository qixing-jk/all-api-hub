import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  resolveNewApiManagedSiteConfig,
  resolveSub2ApiManagedSiteConfig,
} from "~~/e2e/utils/realSite/managedSiteConfig"

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

describe("New API managed-site login identity", () => {
  beforeEach(() => {
    vi.stubEnv("AAH_E2E_NEW_API_BASE_URL", "https://newapi.example.invalid")
    vi.stubEnv("AAH_E2E_NEW_API_ADMIN_TOKEN", "admin-token")
    vi.stubEnv("AAH_E2E_NEW_API_ADMIN_USER_ID", "1")
    vi.stubEnv("AAH_E2E_NEW_API_USERNAME", "ordinary-user")
    vi.stubEnv("AAH_E2E_NEW_API_PASSWORD", "ordinary-password")
    vi.stubEnv("AAH_E2E_NEW_API_TOTP_SECRET", "ordinary-totp")
    vi.stubEnv("AAH_E2E_NEW_API_ADMIN_USERNAME", "")
    vi.stubEnv("AAH_E2E_NEW_API_ADMIN_PASSWORD", "")
    vi.stubEnv("AAH_E2E_NEW_API_ADMIN_TOTP_SECRET", "")
  })
  afterEach(() => vi.unstubAllEnvs())
  it("does not combine an admin token with ordinary account login credentials", () => {
    expect(resolveNewApiManagedSiteConfig().config).toMatchObject({
      userId: "1",
      adminToken: "admin-token",
      username: "",
      password: "",
      totpSecret: "",
    })
  })
  it("uses the administrator's own login credentials and TOTP", () => {
    vi.stubEnv("AAH_E2E_NEW_API_ADMIN_USERNAME", "admin-user")
    vi.stubEnv("AAH_E2E_NEW_API_ADMIN_PASSWORD", "admin-password")
    vi.stubEnv("AAH_E2E_NEW_API_ADMIN_TOTP_SECRET", "admin-totp")
    expect(resolveNewApiManagedSiteConfig().config).toMatchObject({
      userId: "1",
      username: "admin-user",
      password: "admin-password",
      totpSecret: "admin-totp",
    })
  })
})
