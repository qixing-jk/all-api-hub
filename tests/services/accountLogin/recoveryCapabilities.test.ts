import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_COOKIE_VALIDATION_STATUS } from "~/constants/accountCookieValidation"
import {
  ACCOUNT_LOGIN_CONFIGURATION_KINDS,
  ACCOUNT_LOGIN_CREDENTIAL_KINDS,
} from "~/constants/accountLogin"
import { executeWithAccountCredentialRecovery } from "~/services/accountCredentialRecovery"
import { recoverAccountCookieForDialog } from "~/services/accountCredentialRecovery/manual"
import { getAccountLoginMethods } from "~/services/accountLogin/capabilities"
import { accountLoginConfiguration } from "~/services/accountLogin/configuration"
import { isValidAccount } from "~/services/accounts/editing/accountFormValidation"
import * as definitions from "~/services/accountSiteDefinitions"
import type { AccountLoginMethodDefinition } from "~/services/apiAdapters/contracts/accountLogin"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum, type SiteAccount } from "~/types"

const deps = vi.hoisted(() => ({
  login: vi.fn(),
  supports: vi.fn(),
  read: vi.fn(),
  mutate: vi.fn(),
  methods: [] as AccountLoginMethodDefinition[],
  verify: vi.fn(),
  identityReader: vi.fn(),
  hasIdentityReader: true,
}))
vi.mock("~/services/accounts/cookieValidation", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/services/accounts/cookieValidation")
  >()),
  validateAccountCookie: deps.verify,
}))
// Deliberately different adapter-family contract, not an AIHubMix support claim.
vi.mock("~/services/apiAdapters/aihubmix", () => ({
  aihubmixCapabilities: {
    siteType: "AIHubMix",
    account: {
      bootstrap: {
        get fetchUserInfo() {
          return deps.hasIdentityReader ? deps.identityReader : undefined
        },
      },
      login: {
        get methods() {
          return deps.methods
        },
        supports: deps.supports,
        login: deps.login,
      },
    },
  },
}))
vi.mock("~/services/accounts/accountStorage/accountConfigStore", () => ({
  accountConfigStore: { read: deps.read, mutateAccount: deps.mutate },
}))

describe("recovery through the actual login capability", () => {
  afterEach(() => vi.restoreAllMocks())
  let account: SiteAccount
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetAllMocks()
    deps.hasIdentityReader = true
    const originalProfile = definitions.getAccountSiteProductProfileOverride
    vi.spyOn(
      definitions,
      "getAccountSiteProductProfileOverride",
    ).mockImplementation((siteType) => {
      const profile = originalProfile(siteType)
      return siteType === "AIHubMix"
        ? {
            ...profile,
            auth: {
              ...profile?.auth,
              allowedAuthTypes: [AuthTypeEnum.AccessToken, AuthTypeEnum.Cookie],
            },
          }
        : profile
    })
    deps.verify.mockResolvedValue({
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Valid,
    })
    const original = definitions.getAccountSiteDefinition
    vi.spyOn(definitions, "getAccountSiteDefinition").mockImplementation(
      (siteType) => {
        const definition = original(siteType)
        return siteType === "AIHubMix" && definition
          ? {
              ...definition,
              accountLogin: {
                methods: ["company-sso"],
                supportsCredentialRecovery: true,
              },
            }
          : definition
      },
    )
    deps.methods = [
      {
        id: "company-sso",
        label: "Company SSO",
        configuration: { kind: ACCOUNT_LOGIN_CONFIGURATION_KINDS.None },
        credentialRecovery: ACCOUNT_LOGIN_CREDENTIAL_KINDS.Cookie,
      },
    ]
    deps.supports.mockReturnValue(true)
    deps.login.mockResolvedValue({
      status: "authenticated",
      identity: "user-17",
      credential: { cookie: "company_session=renewed" },
    })
    account = {
      id: "saved",
      site_type: "AIHubMix",
      site_url: "https://console.example",
      authType: AuthTypeEnum.Cookie,
      account_info: { id: "user-17" },
      cookieAuth: { sessionCookie: "company_session=expired" },
      login: { methodId: "company-sso", automaticRecovery: true },
    } as SiteAccount
    deps.read.mockImplementation(async () => ({ accounts: [account] }))
    deps.mutate.mockImplementation(async (_id, mutation) => {
      const result = mutation(account)
      account = result.nextAccount
      return result.result
    })
  })

  it("recovers a custom method manually and automatically without New API assumptions", async () => {
    const validation = await vi.importActual<
      typeof import("~/services/accounts/cookieValidation")
    >("~/services/accounts/cookieValidation")
    deps.verify.mockImplementation(validation.validateAccountCookie)
    deps.identityReader.mockResolvedValue({ id: "user-17" })
    await expect(
      recoverAccountCookieForDialog({ account, requestId: "manual" }),
    ).resolves.toMatchObject({
      status: "authenticated",
      credential: { cookie: "company_session=renewed" },
    })
    expect(deps.mutate).not.toHaveBeenCalled()
    const runner = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError("expired", 401, "/identity", API_ERROR_CODES.HTTP_401),
      )
      .mockImplementationOnce(async (request) => request.auth.cookie)
    await expect(
      executeWithAccountCredentialRecovery(
        {
          accountId: account.id,
          siteType: account.site_type,
          baseUrl: account.site_url,
          allowAccountCredentialRecovery: true,
          auth: {
            authType: AuthTypeEnum.Cookie,
            userId: "user-17",
            cookie: "company_session=expired",
          },
        },
        runner,
      ),
    ).resolves.toBe("company_session=renewed")
    expect(account.cookieAuth?.sessionCookie).toBe("company_session=renewed")
    expect(deps.login).toHaveBeenCalledTimes(2)
    expect(runner).toHaveBeenCalledTimes(2)
  })
  it("retains a custom password method through save, read and manual recovery", async () => {
    deps.methods = [
      {
        id: "native-password",
        label: "Member login",
        configuration: {
          kind: ACCOUNT_LOGIN_CONFIGURATION_KINDS.Password,
          identity: "email",
        },
        credentialRecovery: ACCOUNT_LOGIN_CREDENTIAL_KINDS.Cookie,
      },
    ]
    const login = {
      methodId: "native-password",
      credentials: { username: "member@example.com", password: " secret " },
    }
    await accountLoginConfiguration.configure(account, login)
    expect(await accountLoginConfiguration.read(account)).toEqual(login)
    await expect(
      recoverAccountCookieForDialog({ account, requestId: "manual" }),
    ).resolves.toMatchObject({ status: "authenticated" })
    expect(deps.login).toHaveBeenCalledWith(
      expect.objectContaining({ account: expect.objectContaining({ login }) }),
    )
  })
  it("requires the custom method's inputs before allowing an account form save", () => {
    deps.methods = [
      {
        id: "native-password",
        label: "Member login",
        configuration: {
          kind: ACCOUNT_LOGIN_CONFIGURATION_KINDS.Password,
          identity: "email",
        },
      },
    ]
    const fields = {
      siteType: account.site_type,
      loginMethods: getAccountLoginMethods(account),
      siteName: "Example",
      username: "member",
      userId: "user-17",
      accessToken: "opaque",
      authType: AuthTypeEnum.AccessToken,
      exchangeRate: "7",
    }
    expect(
      isValidAccount({
        ...fields,
        loginChange: { methodId: "native-password" },
      }),
    ).toBe(false)
    expect(
      isValidAccount({
        ...fields,
        loginChange: {
          methodId: "native-password",
          credentials: { username: "member@example.com", password: "secret" },
        },
      }),
    ).toBe(true)
    expect(
      isValidAccount({ ...fields, loginChange: { methodId: "unimplemented" } }),
    ).toBe(false)
  })
  it.each([
    "method",
    "credential",
    "deployment",
    "adoption",
    "identity reader",
  ])(
    "rejects missing %s capability before login or persistence",
    async (missing) => {
      if (missing === "method") account.login!.methodId = "github"
      if (missing === "credential")
        deps.methods[0]!.credentialRecovery = undefined
      if (missing === "deployment") deps.supports.mockReturnValue(false)
      if (missing === "identity reader") deps.hasIdentityReader = false
      if (missing === "adoption") vi.restoreAllMocks()
      await expect(
        recoverAccountCookieForDialog({ account, requestId: "manual" }),
      ).resolves.toMatchObject({ status: "unsupported" })
      const error = new ApiError(
        "expired",
        401,
        "/identity",
        API_ERROR_CODES.HTTP_401,
      )
      const runner = vi.fn().mockRejectedValue(error)
      await expect(
        executeWithAccountCredentialRecovery(
          {
            accountId: account.id,
            siteType: account.site_type,
            baseUrl: account.site_url,
            allowAccountCredentialRecovery: true,
            auth: {
              authType: AuthTypeEnum.Cookie,
              userId: "user-17",
              cookie: "company_session=expired",
            },
          },
          runner,
        ),
      ).rejects.toBe(error)
      expect(deps.login).not.toHaveBeenCalled()
      expect(deps.mutate).not.toHaveBeenCalled()
      expect(runner).toHaveBeenCalledTimes(1)
    },
  )
  it.each([
    {
      status: "authenticated",
      identity: "other-user",
      credential: { cookie: "company_session=other" },
    },
    { status: "authenticated", identity: "user-17" },
    { status: "interaction_required" },
  ])(
    "preserves a non-recovered result without changing the draft or account",
    async (result) => {
      deps.login.mockResolvedValue(result)
      const before = structuredClone(account)
      const outcome = await recoverAccountCookieForDialog({
        account,
        requestId: "manual",
      })
      expect(outcome.status).not.toBe("authenticated")
      expect(account).toEqual(before)
      expect(deps.mutate).not.toHaveBeenCalled()
    },
  )
})
