import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  resolveGptLoadManagedSiteConfig,
  resolveNewApiManagedSiteConfig,
  resolveSub2ApiManagedSiteConfig,
} from "~~/e2e/utils/realSite/managedSiteConfig"

describe("gpt-load managed-site real-site config", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("requires its own root management key without using another admin token", () => {
    vi.stubEnv("AAH_E2E_GPT_LOAD_BASE_URL", "http://127.0.0.1:3001")
    vi.stubEnv("AAH_E2E_GPT_LOAD_MANAGEMENT_KEY", "")
    vi.stubEnv("AAH_E2E_GPT_LOAD_ADMIN_TOKEN", "downstream-key")
    expect(resolveGptLoadManagedSiteConfig()).toEqual({
      config: null,
      missingEnvKeys: ["AAH_E2E_GPT_LOAD_MANAGEMENT_KEY"],
    })
  })

  it("trims configuration and retains a self-hosted HTTP base URL", () => {
    vi.stubEnv("AAH_E2E_GPT_LOAD_BASE_URL", " http://127.0.0.1:3001 ")
    vi.stubEnv("AAH_E2E_GPT_LOAD_MANAGEMENT_KEY", " test-management-key ")
    expect(resolveGptLoadManagedSiteConfig()).toEqual({
      config: {
        baseUrl: "http://127.0.0.1:3001",
        managementKey: "test-management-key",
      },
      missingEnvKeys: [],
    })
  })
})

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
