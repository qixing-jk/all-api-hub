import { describe, expect, it } from "vitest"

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
      enableDetection: true,
      autoCheckInEnabled: true,
    },
    sub2apiUseRefreshToken: true,
    sub2apiRefreshToken: " refresh-token ",
    sub2apiTokenExpiresAt: 123456,
    ...overrides,
  }
}

describe("Account Dialog site policy", () => {
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
    expect(normalized.checkIn.enableDetection).toBe(true)
    expect(normalized.checkIn.autoCheckInEnabled).toBe(true)
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
    ).toBe(true)
  })

  it("preserves draft identity when site policy normalization is a no-op", () => {
    const policy = getAccountDialogSitePolicy(SITE_TYPES.SUB2API)
    const draft = createDraft({
      siteType: SITE_TYPES.SUB2API,
      authType: AuthTypeEnum.AccessToken,
      cookieAuthSessionCookie: "",
      checkIn: {
        ...createEmptyAccountDialogDraft().checkIn,
        enableDetection: false,
        autoCheckInEnabled: false,
      },
    })

    expect(
      normalizeAccountDialogDraftForSitePolicy({
        draft,
        policy,
      }),
    ).toBe(draft)
  })

  it("normalizes Sub2API dialogs to access-token auth and inactive built-in check-in", () => {
    const policy = getAccountDialogSitePolicy(SITE_TYPES.SUB2API)
    const normalized = normalizeAccountDialogDraftForSitePolicy({
      draft: createDraft({ siteType: SITE_TYPES.SUB2API }),
      policy,
    })

    expect(normalized.authType).toBe(AuthTypeEnum.AccessToken)
    expect(normalized.cookieAuthSessionCookie).toBe("")
    expect(normalized.checkIn.enableDetection).toBe(false)
    expect(normalized.checkIn.autoCheckInEnabled).toBe(false)
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

  it("normalizes AIHubMix detected browser sessions to saved access-token accounts", () => {
    const policy = getAccountDialogSitePolicy(SITE_TYPES.AIHUBMIX)
    const normalized = normalizeAccountDialogDraftForSitePolicy({
      draft: createDraft({ siteType: SITE_TYPES.AIHUBMIX }),
      policy,
    })

    expect(normalized.authType).toBe(AuthTypeEnum.AccessToken)
    expect(normalized.cookieAuthSessionCookie).toBe("")
    expect(normalized.checkIn.enableDetection).toBe(true)
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
