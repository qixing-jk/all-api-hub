import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  canCreateAccountApiTokens,
  canListAccountRuntimeKeys,
  canResolveAccountRuntimeKeySecret,
  canRotateAccountServiceCredential,
  canRunAccountDefaultTokenAutomation,
  createStoredAccountKeyProductContext,
  getAccountKeyProductCapabilities,
} from "~/services/accounts/keyProductCapabilities"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { AuthTypeEnum } from "~/types"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: vi.fn(),
}))

const ACCOUNT = {
  id: "account-1",
  siteType: SITE_TYPES.NEW_API,
  baseUrl: "https://example.invalid",
  authType: AuthTypeEnum.AccessToken,
  userId: "1",
  token: "access-token",
  cookieAuthSessionCookie: "",
}

describe("account key product capabilities", () => {
  const keyManagement = {
    fetchTokens: vi.fn(),
    createToken: vi.fn(),
    updateToken: vi.fn(),
    resolveTokenKey: vi.fn(),
    deleteToken: vi.fn(),
    fetchAvailableModels: vi.fn(),
    userGroups: {
      fetch: vi.fn(),
    },
  }
  const serviceCredential = {
    fetch: vi.fn(),
    rotate: vi.fn(),
  }

  beforeEach(() => {
    vi.mocked(getSiteTypeCapabilities).mockReset()
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
      account: {
        keyManagement,
      },
    } as any)
  })

  it("maps full key-management accounts to token CRUD and metadata capabilities", () => {
    expect(getAccountKeyProductCapabilities(ACCOUNT as any)).toEqual({
      runtimeKeys: {
        list: true,
        resolveSecret: true,
      },
      apiTokens: {
        create: true,
        update: true,
        delete: true,
      },
      tokenMetadata: {
        fetchAvailableModels: true,
        fetchUserGroups: true,
      },
      serviceCredential: {
        fetch: false,
        rotate: false,
      },
      defaultTokenAutomation: {
        run: false,
      },
    })
    expect(canCreateAccountApiTokens(ACCOUNT as any)).toBe(true)
    expect(canRunAccountDefaultTokenAutomation(ACCOUNT as any)).toBe(false)
    expect(canListAccountRuntimeKeys(ACCOUNT as any)).toBe(true)
    expect(canResolveAccountRuntimeKeySecret(ACCOUNT as any)).toBe(true)
  })

  it("maps default-token automation only when token provisioning is also available", () => {
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
      account: {
        keyManagement,
        tokenProvisioning: {
          isInventoryTokenUsable: vi.fn(),
          resolveDefaultTokenCreation: vi.fn(),
          classifyCreatedToken: vi.fn(),
          getRepairPolicy: vi.fn(),
        },
      },
    } as any)

    expect(getAccountKeyProductCapabilities(ACCOUNT as any)).toMatchObject({
      defaultTokenAutomation: {
        run: true,
      },
    })
    expect(canRunAccountDefaultTokenAutomation(ACCOUNT as any)).toBe(true)
  })

  it("maps service-credential-only accounts to runtime-key access without token CRUD", () => {
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.SHAREDCHAT,
      account: {
        serviceCredential,
      },
    } as any)

    const account = {
      ...ACCOUNT,
      siteType: SITE_TYPES.SHAREDCHAT,
    }

    expect(getAccountKeyProductCapabilities(account as any)).toEqual({
      runtimeKeys: {
        list: true,
        resolveSecret: true,
      },
      apiTokens: {
        create: false,
        update: false,
        delete: false,
      },
      tokenMetadata: {
        fetchAvailableModels: false,
        fetchUserGroups: false,
      },
      serviceCredential: {
        fetch: true,
        rotate: true,
      },
      defaultTokenAutomation: {
        run: false,
      },
    })
    expect(canCreateAccountApiTokens(account as any)).toBe(false)
    expect(canRunAccountDefaultTokenAutomation(account as any)).toBe(false)
    expect(canListAccountRuntimeKeys(account as any)).toBe(true)
    expect(canResolveAccountRuntimeKeySecret(account as any)).toBe(true)
    expect(canRotateAccountServiceCredential(account as any)).toBe(true)
  })

  it("projects stored accounts into the same product capability context", () => {
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      siteType: SITE_TYPES.SHAREDCHAT,
      account: {
        serviceCredential,
      },
    } as any)

    const storedAccount = buildSiteAccount({
      id: "sharedchat-stored-account",
      site_type: SITE_TYPES.SHAREDCHAT,
      site_url: "https://sharedchat.example.invalid",
      authType: AuthTypeEnum.Cookie,
      cookieAuth: { sessionCookie: "session=abc" },
      account_info: {
        id: "sharedchat-user",
        access_token: "",
        username: "SharedChat User",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    })

    const productContext = createStoredAccountKeyProductContext(storedAccount)

    expect(productContext).toEqual(
      expect.objectContaining({
        id: "sharedchat-stored-account",
        baseUrl: "https://sharedchat.example.invalid",
        siteType: SITE_TYPES.SHAREDCHAT,
        userId: "sharedchat-user",
        token: "",
        cookieAuthSessionCookie: "session=abc",
      }),
    )
    expect(canListAccountRuntimeKeys(productContext)).toBe(true)
    expect(canCreateAccountApiTokens(productContext)).toBe(false)
    expect(canRunAccountDefaultTokenAutomation(productContext)).toBe(false)
  })

  it("returns no account-key product capabilities for invalid account context", () => {
    expect(getAccountKeyProductCapabilities(null)).toEqual({
      runtimeKeys: {
        list: false,
        resolveSecret: false,
      },
      apiTokens: {
        create: false,
        update: false,
        delete: false,
      },
      tokenMetadata: {
        fetchAvailableModels: false,
        fetchUserGroups: false,
      },
      serviceCredential: {
        fetch: false,
        rotate: false,
      },
      defaultTokenAutomation: {
        run: false,
      },
    })
    expect(
      getAccountKeyProductCapabilities({
        ...ACCOUNT,
        token: "   ",
      } as any),
    ).toMatchObject({
      runtimeKeys: {
        list: false,
        resolveSecret: false,
      },
      apiTokens: {
        create: false,
      },
    })
  })
})
