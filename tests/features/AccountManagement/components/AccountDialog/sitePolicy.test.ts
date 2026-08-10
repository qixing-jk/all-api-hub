import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  createEmptyAccountDialogDraft,
  type AccountDialogDraft,
} from "~/features/AccountManagement/components/AccountDialog/models"
import {
  buildSub2ApiAuthFromAccountDialogDraft,
  getAccountDialogSitePolicy,
  normalizeAccountDialogDraftForSitePolicy,
  shouldAutoImportCookieAuthForAccountDialogSite,
  shouldDeferAccountSaveSuccessForAccountDialogSite,
  shouldOpenSub2ApiTokenDialogForAccountDialogSite,
} from "~/features/AccountManagement/components/AccountDialog/sitePolicy"
import { AuthTypeEnum } from "~/types"

function createDraft(
  overrides: Partial<AccountDialogDraft> = {},
): AccountDialogDraft {
  return {
    ...createEmptyAccountDialogDraft(),
    siteName: "Example",
    username: "user@example.invalid",
    accessToken: "access-token",
    userId: "user-id",
    siteType: SITE_TYPES.UNKNOWN,
    authType: AuthTypeEnum.Cookie,
    cookieAuthSessionCookie: "session=example",
    checkIn: {
      ...createEmptyAccountDialogDraft().checkIn,
      automaticExecutionEnabled: true,
    },
    sub2apiUseRefreshToken: true,
    sub2apiRefreshToken: " refresh-token ",
    sub2apiTokenExpiresAt: 123456,
    ...overrides,
  }
}

describe("Account Dialog site policy", () => {
  it.each([
    [SITE_TYPES.OPENROUTER, "OpenRouter"],
    [SITE_TYPES.SUB2API, "Sub2API"],
    [SITE_TYPES.AIHUBMIX, "AIHubMix"],
  ])("provides the user-facing label for %s", (siteType, siteTypeLabel) => {
    expect(getAccountDialogSitePolicy(siteType).siteTypeLabel).toBe(
      siteTypeLabel,
    )
  })

  it("locks OpenRouter to the canonical management-key account policy", () => {
    const policy = getAccountDialogSitePolicy(SITE_TYPES.OPENROUTER)

    expect(policy).toMatchObject({
      canonicalSiteUrl: "https://openrouter.ai",
      defaultSiteName: "OpenRouter",
      lockSiteUrl: true,
      forceAccessTokenAuth: true,
      requireUsername: false,
      requireUserId: false,
      allowCookieAuthSession: false,
      allowBuiltInCheckInDetection: false,
    })
    expect(policy).not.toHaveProperty("credentialKind")
  })

  it.each([SITE_TYPES.SUB2API, SITE_TYPES.SHAREDCHAT, SITE_TYPES.VO_API_V2])(
    "does not require a username for %s",
    (siteType) => {
      expect(getAccountDialogSitePolicy(siteType).requireUsername).toBe(false)
    },
  )

  it("keeps usernames required for sites whose profile requires them", () => {
    expect(getAccountDialogSitePolicy(SITE_TYPES.NEW_API).requireUsername).toBe(
      true,
    )
  })

  it("returns independent policy objects for callers", () => {
    const firstSub2ApiPolicy = getAccountDialogSitePolicy(SITE_TYPES.SUB2API)
    firstSub2ApiPolicy.allowCookieAutoImport = true

    expect(
      getAccountDialogSitePolicy(SITE_TYPES.SUB2API).allowCookieAutoImport,
    ).toBe(false)

    const firstDefaultPolicy = getAccountDialogSitePolicy(SITE_TYPES.UNKNOWN)
    firstDefaultPolicy.forceAccessTokenAuth = true

    expect(
      getAccountDialogSitePolicy(SITE_TYPES.UNKNOWN).forceAccessTokenAuth,
    ).toBe(false)
  })

  it("keeps compatible site behavior as the default policy", () => {
    const policy = getAccountDialogSitePolicy(SITE_TYPES.UNKNOWN)
    const draft = createDraft()

    const normalized = normalizeAccountDialogDraftForSitePolicy({
      draft,
      policy,
    })

    expect(normalized.authType).toBe(AuthTypeEnum.Cookie)
    expect(normalized.cookieAuthSessionCookie).toBe("session=example")
    expect(normalized.checkIn.automaticExecutionEnabled).toBe(true)
    expect(normalized.sub2apiUseRefreshToken).toBe(false)
    expect(normalized.sub2apiRefreshToken).toBe("")
    expect(normalized.sub2apiTokenExpiresAt).toBeNull()
    expect(policy.requireUsername).toBe(true)
    expect(policy.requireUserId).toBe(true)
    expect(
      shouldAutoImportCookieAuthForAccountDialogSite({
        policy,
        authType: AuthTypeEnum.Cookie,
        cookieAuthSessionCookie: "",
        url: "https://example.invalid",
      }),
    ).toBe(true)
  })

  it("does not fabricate method knowledge when normalizing a supported site", () => {
    const policy = getAccountDialogSitePolicy(SITE_TYPES.NEW_API)
    const draft = createDraft({
      siteType: SITE_TYPES.NEW_API,
      checkIn: {
        ...createEmptyAccountDialogDraft().checkIn,
        automaticExecutionEnabled: false,
      },
    })

    const normalized = normalizeAccountDialogDraftForSitePolicy({
      draft,
      policy,
    })

    expect(normalized.checkIn.automaticExecutionEnabled).toBe(false)
    expect(normalized.checkIn.methodKnowledge).toBe(
      draft.checkIn.methodKnowledge,
    )
    expect(normalized.checkIn.selection).toBe(draft.checkIn.selection)
  })

  it("derives shared auth and supplemental-auth facts from product profiles", async () => {
    vi.resetModules()
    const mockedGetAccountSiteProductProfile = vi.fn()
    vi.doMock("~/services/accounts/accountSiteProfile", async () => {
      const actual = await vi.importActual<
        typeof import("~/services/accounts/accountSiteProfile")
      >("~/services/accounts/accountSiteProfile")
      mockedGetAccountSiteProductProfile.mockImplementation((siteType) => {
        const profile = actual.getAccountSiteProductProfile(siteType)

        return siteType === SITE_TYPES.AIHUBMIX
          ? {
              ...profile,
              auth: {
                ...profile.auth,
                supportsCookieAuth: false,
              },
              supplementalAuth: {
                ...profile.supplementalAuth,
                kind: actual.ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.None,
              },
            }
          : profile
      })

      return {
        ...actual,
        getAccountSiteProductProfile: mockedGetAccountSiteProductProfile,
      }
    })

    const { getAccountDialogSitePolicy: getIsolatedSitePolicy } = await import(
      "~/features/AccountManagement/components/AccountDialog/sitePolicy"
    )

    const sub2apiPolicy = getIsolatedSitePolicy(SITE_TYPES.SUB2API)
    expect(mockedGetAccountSiteProductProfile).toHaveBeenCalledWith(
      SITE_TYPES.SUB2API,
    )
    expect(sub2apiPolicy.allowCookieAuthSession).toBe(false)
    expect(sub2apiPolicy.allowBuiltInCheckInDetection).toBe(false)
    expect(sub2apiPolicy.allowSub2ApiRefreshTokenState).toBe(true)

    const aihubmixPolicy = getIsolatedSitePolicy(SITE_TYPES.AIHUBMIX)
    expect(mockedGetAccountSiteProductProfile).toHaveBeenCalledWith(
      SITE_TYPES.AIHUBMIX,
    )
    expect(aihubmixPolicy.allowCookieAuthSession).toBe(false)
    expect(aihubmixPolicy.allowBuiltInCheckInDetection).toBe(false)
    expect(aihubmixPolicy.allowSub2ApiRefreshTokenState).toBe(false)
    expect(aihubmixPolicy.deferSuccessForOneTimeKeyPostSaveFlow).toBe(true)
    expect(aihubmixPolicy.requireUsername).toBe(true)
    expect(aihubmixPolicy.requireUserId).toBe(true)

    vi.doUnmock("~/services/accounts/accountSiteProfile")
    vi.resetModules()
  })

  it("preserves draft identity when site policy normalization is a no-op", () => {
    const policy = getAccountDialogSitePolicy(SITE_TYPES.SUB2API)
    const draft = createDraft({
      siteType: SITE_TYPES.SUB2API,
      authType: AuthTypeEnum.AccessToken,
      cookieAuthSessionCookie: "",
      checkIn: {
        ...createEmptyAccountDialogDraft().checkIn,
        automaticExecutionEnabled: false,
      },
    })

    expect(
      normalizeAccountDialogDraftForSitePolicy({
        draft,
        policy,
      }),
    ).toBe(draft)
  })

  it("normalizes Sub2API auth without rewriting automatic check-in intent", () => {
    const policy = getAccountDialogSitePolicy(SITE_TYPES.SUB2API)
    const normalized = normalizeAccountDialogDraftForSitePolicy({
      draft: createDraft({ siteType: SITE_TYPES.SUB2API }),
      policy,
    })

    expect(normalized.authType).toBe(AuthTypeEnum.AccessToken)
    expect(normalized.cookieAuthSessionCookie).toBe("")
    expect(normalized.checkIn.automaticExecutionEnabled).toBe(true)
    expect(normalized.sub2apiUseRefreshToken).toBe(true)
    expect(normalized.sub2apiRefreshToken).toBe(" refresh-token ")
    expect(normalized.sub2apiTokenExpiresAt).toBe(123456)
    expect(
      shouldAutoImportCookieAuthForAccountDialogSite({
        policy,
        authType: AuthTypeEnum.Cookie,
        cookieAuthSessionCookie: "",
        url: "https://example.invalid",
      }),
    ).toBe(false)
  })

  it("normalizes AIHubMix browser sessions without rewriting automatic check-in intent", () => {
    const policy = getAccountDialogSitePolicy(SITE_TYPES.AIHUBMIX)
    const normalized = normalizeAccountDialogDraftForSitePolicy({
      draft: createDraft({ siteType: SITE_TYPES.AIHUBMIX }),
      policy,
    })

    expect(normalized.authType).toBe(AuthTypeEnum.AccessToken)
    expect(normalized.cookieAuthSessionCookie).toBe("")
    expect(normalized.checkIn.automaticExecutionEnabled).toBe(true)
    expect(normalized.sub2apiUseRefreshToken).toBe(false)
    expect(normalized.sub2apiRefreshToken).toBe("")
    expect(normalized.sub2apiTokenExpiresAt).toBeNull()
    expect(
      shouldAutoImportCookieAuthForAccountDialogSite({
        policy,
        authType: AuthTypeEnum.Cookie,
        cookieAuthSessionCookie: "",
        url: "https://example.invalid",
      }),
    ).toBe(false)
  })

  it("keeps cookie auto-import behind all required guards", () => {
    const policy = getAccountDialogSitePolicy(SITE_TYPES.UNKNOWN)

    expect(
      shouldAutoImportCookieAuthForAccountDialogSite({
        policy,
        authType: AuthTypeEnum.AccessToken,
        cookieAuthSessionCookie: "",
        url: "https://example.invalid",
      }),
    ).toBe(false)
    expect(
      shouldAutoImportCookieAuthForAccountDialogSite({
        policy,
        authType: AuthTypeEnum.Cookie,
        cookieAuthSessionCookie: "session=example",
        url: "https://example.invalid",
      }),
    ).toBe(false)
    expect(
      shouldAutoImportCookieAuthForAccountDialogSite({
        policy,
        authType: AuthTypeEnum.Cookie,
        cookieAuthSessionCookie: "",
        url: " ",
      }),
    ).toBe(false)
  })

  it("builds Sub2API refresh-token payloads only when the policy and draft enable them", () => {
    const sub2apiPolicy = getAccountDialogSitePolicy(SITE_TYPES.SUB2API)
    const defaultPolicy = getAccountDialogSitePolicy(SITE_TYPES.UNKNOWN)

    expect(
      buildSub2ApiAuthFromAccountDialogDraft({
        draft: createDraft({ siteType: SITE_TYPES.SUB2API }),
        policy: sub2apiPolicy,
      }),
    ).toEqual({
      refreshToken: "refresh-token",
      tokenExpiresAt: 123456,
    })

    expect(
      buildSub2ApiAuthFromAccountDialogDraft({
        draft: createDraft({ siteType: SITE_TYPES.SUB2API }),
        policy: defaultPolicy,
      }),
    ).toBeUndefined()

    expect(
      buildSub2ApiAuthFromAccountDialogDraft({
        draft: createDraft({
          siteType: SITE_TYPES.SUB2API,
          sub2apiUseRefreshToken: false,
        }),
        policy: sub2apiPolicy,
      }),
    ).toBeUndefined()
  })

  it("keeps post-save decisions policy-driven", () => {
    expect(
      shouldOpenSub2ApiTokenDialogForAccountDialogSite({
        policy: getAccountDialogSitePolicy(SITE_TYPES.SUB2API),
        skipSub2ApiKeyPrompt: false,
        hasDisplayData: true,
      }),
    ).toBe(true)

    expect(
      shouldOpenSub2ApiTokenDialogForAccountDialogSite({
        policy: getAccountDialogSitePolicy(SITE_TYPES.SUB2API),
        skipSub2ApiKeyPrompt: true,
        hasDisplayData: true,
      }),
    ).toBe(false)

    expect(
      shouldOpenSub2ApiTokenDialogForAccountDialogSite({
        policy: getAccountDialogSitePolicy(SITE_TYPES.UNKNOWN),
        skipSub2ApiKeyPrompt: false,
        hasDisplayData: true,
      }),
    ).toBe(false)

    expect(
      shouldOpenSub2ApiTokenDialogForAccountDialogSite({
        policy: getAccountDialogSitePolicy(SITE_TYPES.SUB2API),
        skipSub2ApiKeyPrompt: false,
        hasDisplayData: false,
      }),
    ).toBe(false)

    expect(
      shouldDeferAccountSaveSuccessForAccountDialogSite({
        policy: getAccountDialogSitePolicy(SITE_TYPES.AIHUBMIX),
        isAddMode: true,
        autoProvisionKeyOnAccountAdd: true,
        skipAutoProvisionKeyOnAccountAdd: false,
      }),
    ).toBe(true)

    expect(
      shouldDeferAccountSaveSuccessForAccountDialogSite({
        policy: getAccountDialogSitePolicy(SITE_TYPES.UNKNOWN),
        isAddMode: true,
        autoProvisionKeyOnAccountAdd: true,
        skipAutoProvisionKeyOnAccountAdd: false,
      }),
    ).toBe(false)

    expect(
      shouldDeferAccountSaveSuccessForAccountDialogSite({
        policy: getAccountDialogSitePolicy(SITE_TYPES.AIHUBMIX),
        isAddMode: true,
        autoProvisionKeyOnAccountAdd: true,
        skipAutoProvisionKeyOnAccountAdd: true,
      }),
    ).toBe(false)
  })
})
