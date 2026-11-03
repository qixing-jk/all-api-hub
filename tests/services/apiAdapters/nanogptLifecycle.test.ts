import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions"
import {
  ACCOUNT_BOOTSTRAP_ROUTE_KINDS,
  type AccountBootstrapRouteTarget,
} from "~/services/apiAdapters/contracts/accountBootstrap"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { getAccountSiteType } from "~/services/siteDetection/detectSiteType"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

import { createAccountCompletionHelpersMock } from "./checkInFixtures"

const API_ORIGIN = "https://api.nano-gpt.com"
const CONSOLE_ORIGIN = "https://nano-gpt.com"
const DEPOSIT_ADDRESS = "nano_fixture_deposit_address"

const balanceBody = {
  usd_balance: "12.5",
  nano_balance: "0",
  nanoDepositAddress: DEPOSIT_ADDRESS,
}

const completionRequest = (
  overrides: {
    accessToken?: string
    detectedUser?: Record<string, unknown>
  } = {},
) => ({
  url: CONSOLE_ORIGIN,
  requestedAuthType: AuthTypeEnum.AccessToken,
  existingAccessToken: overrides.accessToken ?? "sk-nano-fixture",
  detected: {
    userId: DEPOSIT_ADDRESS,
    user: {
      id: "00000000-0000-4000-8000-0000000000a1",
      username: "Example User",
      nanoDepositAddress: DEPOSIT_ADDRESS,
      ...overrides.detectedUser,
    },
    siteType: SITE_TYPES.NANOGPT,
  },
  context: {},
})

beforeEach(() => server.resetHandlers())

describe("NanoGPT registration", () => {
  it("registers one account type with its own adapter family", () => {
    const definition = getAccountSiteDefinition(SITE_TYPES.NANOGPT)

    expect(definition).toMatchObject({
      adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NanoGPT,
      scopes: ["account"],
      onboarding: {
        displayName: "NanoGPT",
        accountForm: {
          fixedSiteUrl: CONSOLE_ORIGIN,
          defaultSiteName: "NanoGPT",
          accessTokenLabelKey: "form.nanoGptApiKey",
          accessTokenGuidanceTitleKey: "form.nanoGptApiKeyGuidanceTitle",
          accessTokenGuidanceKey: "form.nanoGptApiKeyGuidance",
        },
        detection: { hostnames: ["nano-gpt.com"] },
        routes: {
          loginPath: "/join",
          usagePath: "/usage",
          adminCredentialsPath: "/api",
          pricingPath: "/pricing",
          checkInPath: null,
          accessTokenPath: "/api",
          redeemPath: null,
          siteAnnouncementsPath: null,
        },
      },
    })
    // The key is the only durable credential; console cookies cannot read it.
    expect(definition?.productProfile?.auth).toEqual({
      allowedAuthTypes: [AuthTypeEnum.AccessToken],
      defaultAuthType: AuthTypeEnum.AccessToken,
      defaultAuthHostnames: [],
    })
    expect(definition?.productProfile?.urls).toMatchObject({
      recognizedHostnames: ["nano-gpt.com"],
      storageOrigin: CONSOLE_ORIGIN,
      duplicateOrigin: CONSOLE_ORIGIN,
      managedChannelOrigin: "https://api.nano-gpt.com/api/v1",
      inferenceApiBaseUrls: {
        openAiCompatible: "https://api.nano-gpt.com/api/v1",
      },
    })
  })

  it("detects the console hostname", async () => {
    await expect(getAccountSiteType(CONSOLE_ORIGIN)).resolves.toBe(
      SITE_TYPES.NANOGPT,
    )
    await expect(
      getAccountSiteType("https://NANO-GPT.com/usage"),
    ).resolves.toBe(SITE_TYPES.NANOGPT)
  })

  it("exposes only the capabilities it can honour", () => {
    const capabilities = getSiteTypeCapabilities(SITE_TYPES.NANOGPT)

    expect(capabilities.family).toBe(ACCOUNT_SITE_ADAPTER_FAMILIES.NanoGPT)
    const account = capabilities.account!
    expect(account.bootstrap).toBeDefined()
    expect(account.completion).toBeDefined()
    expect(account.data).toBeDefined()
    expect(account.refresh).toBeDefined()
    expect(account.providerModelCatalog).toBeDefined()
    // Native key CRUD uses management tokens; no read-only invitation contract exists.
    expect(account.keyResourceManagement).toBeDefined()
    expect(account.inviteLink).toBeUndefined()
    expect(account.modelCatalog).toBeUndefined()
    expect(account.modelPricing).toBeUndefined()
  })
})

describe("NanoGPT bootstrap", () => {
  it("resolves the verified console routes and reports no check-in", async () => {
    const bootstrap = getSiteTypeCapabilities(SITE_TYPES.NANOGPT).account!
      .bootstrap!

    await expect(
      bootstrap.loadBootstrapFacts({
        baseUrl: CONSOLE_ORIGIN,
        auth: { authType: AuthTypeEnum.AccessToken },
      }),
    ).resolves.toMatchObject({
      displayName: "NanoGPT",
      checkInSupported: false,
    })

    const target: AccountBootstrapRouteTarget = {
      baseUrl: CONSOLE_ORIGIN,
      siteType: SITE_TYPES.NANOGPT,
    }
    await expect(
      bootstrap.resolveRoutePath(
        target,
        ACCOUNT_BOOTSTRAP_ROUTE_KINDS.AdminCredentials,
      ),
    ).resolves.toBe("/api")
    await expect(
      bootstrap.resolveRoutePath(target, ACCOUNT_BOOTSTRAP_ROUTE_KINDS.Usage),
    ).resolves.toBe("/usage")
    await expect(
      bootstrap.resolveRoutePath(target, ACCOUNT_BOOTSTRAP_ROUTE_KINDS.CheckIn),
    ).resolves.toBeNull()
  })

  it("reuses the saved key instead of issuing a new credential", async () => {
    server.use(
      http.post(`${API_ORIGIN}/api/check-balance`, () =>
        HttpResponse.json(balanceBody),
      ),
    )
    const bootstrap = getSiteTypeCapabilities(SITE_TYPES.NANOGPT).account!
      .bootstrap!

    await expect(
      bootstrap.getOrCreateAccessToken({
        baseUrl: CONSOLE_ORIGIN,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "sk-nano-fixture",
        },
      }),
    ).resolves.toEqual({
      username: "",
      access_token: "sk-nano-fixture",
    })
  })
})

describe("NanoGPT completion", () => {
  it("saves the key together with the identity it proves", async () => {
    server.use(
      http.post(`${API_ORIGIN}/api/check-balance`, () =>
        HttpResponse.json(balanceBody),
      ),
    )
    const { helpers, captureRecoveryData } = createAccountCompletionHelpersMock(
      SITE_TYPES.NANOGPT,
      { automaticExecutionEnabled: false },
    )
    const completion = getSiteTypeCapabilities(SITE_TYPES.NANOGPT).account!
      .completion!

    await expect(
      completion.complete(completionRequest(), helpers),
    ).resolves.toMatchObject({
      accessToken: "sk-nano-fixture",
      userId: DEPOSIT_ADDRESS,
      username: "Example User",
      siteName: "NanoGPT",
      authType: AuthTypeEnum.AccessToken,
    })
    expect(captureRecoveryData).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: DEPOSIT_ADDRESS,
        accessToken: "sk-nano-fixture",
        authType: AuthTypeEnum.AccessToken,
      }),
    )
  })

  it("retains usable onboarding defaults when only the inference key is missing", async () => {
    const { helpers, captureRecoveryData } = createAccountCompletionHelpersMock(
      SITE_TYPES.NANOGPT,
      {
        automaticExecutionEnabled: false,
      },
    )
    const completion = getSiteTypeCapabilities(SITE_TYPES.NANOGPT).account!
      .completion!

    await expect(
      completion.complete(completionRequest({ accessToken: "" }), helpers),
    ).rejects.toMatchObject({ reason: "access_token_missing" })
    expect(captureRecoveryData).toHaveBeenCalledWith({ exchangeRate: 7.2 })
    expect(captureRecoveryData).toHaveBeenCalledWith({ siteName: "NanoGPT" })
  })

  it("rejects a key that belongs to a different signed-in account", async () => {
    server.use(
      http.post(`${API_ORIGIN}/api/check-balance`, () =>
        HttpResponse.json({
          ...balanceBody,
          nanoDepositAddress: "nano_other_account",
        }),
      ),
    )
    const { helpers } = createAccountCompletionHelpersMock(SITE_TYPES.NANOGPT, {
      automaticExecutionEnabled: false,
    })
    const completion = getSiteTypeCapabilities(SITE_TYPES.NANOGPT).account!
      .completion!

    await expect(
      completion.complete(completionRequest(), helpers),
    ).rejects.toMatchObject({ reason: "account_identity_mismatch" })
  })

  it("reports a rejected key as a token failure", async () => {
    server.use(
      http.post(`${API_ORIGIN}/api/check-balance`, () =>
        HttpResponse.json(
          { error: { message: "Invalid API key" } },
          { status: 401 },
        ),
      ),
    )
    const { helpers } = createAccountCompletionHelpersMock(SITE_TYPES.NANOGPT, {
      automaticExecutionEnabled: false,
    })
    const completion = getSiteTypeCapabilities(SITE_TYPES.NANOGPT).account!
      .completion!

    await expect(
      completion.complete(completionRequest(), helpers),
    ).rejects.toMatchObject({ reason: "token_fetch_failed" })
  })
})

describe("NanoGPT refresh identity", () => {
  it("does not replace a saved account with another key's balance", async () => {
    server.use(
      http.post(`${API_ORIGIN}/api/check-balance`, () =>
        HttpResponse.json({
          ...balanceBody,
          nanoDepositAddress: "nano_other_account",
        }),
      ),
      http.get(`${API_ORIGIN}/api/v1/usage`, () =>
        HttpResponse.json({
          totals: { requests: 1, totalTokens: 10, costUsd: 0.01 },
        }),
      ),
      http.get(`${API_ORIGIN}/api/subscription/v1/usage`, () =>
        HttpResponse.json({ active: false }),
      ),
    )
    const refresh = getSiteTypeCapabilities(SITE_TYPES.NANOGPT).account!
      .refresh!
    const result = await refresh.refreshAccount({
      baseUrl: CONSOLE_ORIGIN,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "sk-nano-other-account",
        userId: DEPOSIT_ADDRESS,
      },
      checkIn: buildCheckInConfig(),
    })
    expect(result).toMatchObject({ success: false })
    expect(result.data).toBeUndefined()
  })
})

describe("NanoGPT credential admission", () => {
  it("does not disclose a legacy UUID credential echoed by the provider", async () => {
    const legacyKey = "00000000-0000-4000-8000-0000000000b2"
    server.use(
      http.post(`${API_ORIGIN}/api/check-balance`, () =>
        HttpResponse.json(
          { error: { message: `Rejected credential ${legacyKey}` } },
          { status: 401 },
        ),
      ),
    )
    const persistence = getSiteTypeCapabilities(SITE_TYPES.NANOGPT).account!
      .persistence!
    const error = await persistence
      .prepareIdentity({ accessToken: legacyKey, userId: DEPOSIT_ADDRESS })
      .catch((error) => error)
    expect(error).toBeInstanceOf(Error)
    expect(persistence.getValidationFailureMessage(error)).not.toContain(
      legacyKey,
    )
    expect(persistence.getHealthFailureReason(error)).not.toContain(legacyKey)
    expect(
      persistence.getOperationLogDetails({ error }, { status: "failed" }),
    ).toEqual({ status: "failed" })
  })
  it("derives the saved identity from a key-only manual account", async () => {
    server.use(
      http.post(`${API_ORIGIN}/api/check-balance`, () =>
        HttpResponse.json(balanceBody),
      ),
    )
    const persistence = getSiteTypeCapabilities(SITE_TYPES.NANOGPT).account!
      .persistence!
    expect(persistence).toBeDefined()
    await expect(
      persistence.prepareIdentity({
        accessToken: "sk-nano-fixture",
        userId: "",
      }),
    ).resolves.toBe(DEPOSIT_ADDRESS)
  })
  it("rejects a changed key owned by another account before configuration-only fallback", async () => {
    server.use(
      http.post(`${API_ORIGIN}/api/check-balance`, () =>
        HttpResponse.json({
          ...balanceBody,
          nanoDepositAddress: "nano_other_account",
        }),
      ),
    )
    const persistence = getSiteTypeCapabilities(SITE_TYPES.NANOGPT).account!
      .persistence!
    expect(persistence).toBeDefined()
    await expect(
      persistence.prepareIdentity({
        accessToken: "sk-nano-other",
        userId: DEPOSIT_ADDRESS,
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_IDENTITY_MISMATCH" })
  })
  it("retains verified identity for an unchanged saved credential without requiring a network read", async () => {
    const existingAccount = buildSiteAccount({
      site_type: SITE_TYPES.NANOGPT,
      account_info: {
        ...buildSiteAccount().account_info,
        id: DEPOSIT_ADDRESS,
        access_token: "sk-nano-fixture",
      },
    })
    const persistence = getSiteTypeCapabilities(SITE_TYPES.NANOGPT).account!
      .persistence!
    expect(persistence).toBeDefined()
    await expect(
      persistence.prepareIdentity({
        accessToken: "sk-nano-fixture",
        userId: DEPOSIT_ADDRESS,
        existingAccount,
      }),
    ).resolves.toBe(DEPOSIT_ADDRESS)
  })
})

describe("NanoGPT dual credential admission", () => {
  it("accepts a usage-only management token without requiring a spending-capable inference key", async () => {
    server.use(
      http.get(`${CONSOLE_ORIGIN}/api/management/v1/subscription/usage`, () =>
        HttpResponse.json({ active: false, state: "inactive" }),
      ),
    )
    const identity = await getSiteTypeCapabilities(
      SITE_TYPES.NANOGPT,
    ).account!.persistence!.prepareIdentity({
      accessToken: "sk-nano-mgmt-fixture",
      userId: "",
    })
    expect(identity).toMatch(/^nanogpt-management:/)
    expect(identity).not.toContain("sk-nano-mgmt-fixture")
    const result = await getSiteTypeCapabilities(
      SITE_TYPES.NANOGPT,
    ).account!.completion!.complete(
      completionRequest({ accessToken: "sk-nano-mgmt-fixture" }),
      createAccountCompletionHelpersMock(SITE_TYPES.NANOGPT, {
        automaticExecutionEnabled: false,
      }).helpers,
    )
    expect(result.userId).toBe(identity)
    expect(result.accessToken).toBe("sk-nano-mgmt-fixture")
  })
})

it("exposes only the saved inference secret as a runtime credential from a dual account", async () => {
  server.use(
    http.post(`${API_ORIGIN}/api/check-balance`, () =>
      HttpResponse.json(balanceBody),
    ),
  )
  const credential = await getSiteTypeCapabilities(
    SITE_TYPES.NANOGPT,
  ).account!.serviceCredential!.fetch({
    baseUrl: CONSOLE_ORIGIN,
    auth: {
      authType: AuthTypeEnum.AccessToken,
      accessToken:
        'nanogpt-credentials:{"apiKey":"sk-nano-fixture","managementToken":"sk-nano-mgmt-fixture"}',
    },
  })
  expect(credential.key).toBe("sk-nano-fixture")
  expect(credential.baseUrl).toBe("https://api.nano-gpt.com/api/v1")
})
