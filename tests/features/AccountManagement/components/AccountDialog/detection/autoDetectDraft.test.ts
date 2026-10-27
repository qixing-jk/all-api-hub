import { describe, expect, it } from "vitest"

import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_SELECTION_MODES,
} from "~/constants/checkIn"
import { DIALOG_MODES } from "~/constants/dialogModes"
import { SITE_TYPES } from "~/constants/siteType"
import {
  buildDraftFromAutoDetectResult,
  mergeAutoDetectRecoveryIntoDraft,
  resolveAutoDetectRecovery,
} from "~/features/AccountManagement/components/AccountDialog/detection/autoDetectDraft"
import { getAccountDialogSitePolicy } from "~/features/AccountManagement/components/AccountDialog/form/sitePolicy"
import { createEmptyAccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import { AuthTypeEnum } from "~/types"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

describe("account dialog auto-detect draft mapping", () => {
  it.each([SITE_TYPES.NEW_API, SITE_TYPES.SUB2API, SITE_TYPES.NOVITA])(
    "replaces only automatic names in complete and partial detection for %s",
    (siteType) => {
      for (const siteNameEdited of [false, true]) {
        const draft = {
          ...createEmptyAccountDialogDraft(siteType),
          siteName: "Page title",
          siteNameEdited,
        }
        const expected = siteNameEdited ? "Page title" : "Detected site"
        expect(
          mergeAutoDetectRecoveryIntoDraft({
            draft,
            recoveryData: { siteName: "Detected site" },
            nextSiteType: siteType,
            hasExplicitAuthType: false,
            sub2apiRefreshTokenPreferenceChanged: false,
          }).siteName,
        ).toBe(expected)
        expect(
          buildDraftFromAutoDetectResult({
            draft,
            resultData: {
              siteName: "Detected site",
              username: "user",
              userId: "1",
              accessToken: "token",
              exchangeRate: null,
              checkIn: draft.checkIn,
            },
            nextSiteType: siteType,
            nextCheckIn: draft.checkIn,
            preserveExistingCheckIn: false,
            automaticExecutionPreferenceChanged: false,
            mode: DIALOG_MODES.ADD,
            policy: getAccountDialogSitePolicy(siteType),
          }).siteName,
        ).toBe(expected)
      }
    },
  )
  it.each([false, true])(
    "keeps a captcha deployment off unless the user opted in: %s",
    (optedIn) => {
      const nextCheckIn = buildCheckInConfig({
        automaticExecutionEnabled: false,
      })
      const draft = createEmptyAccountDialogDraft(SITE_TYPES.PMAPI)
      draft.checkIn.automaticExecutionEnabled = true
      const merged = buildDraftFromAutoDetectResult({
        draft,
        resultData: {
          username: "pm-user",
          siteName: "PM-API",
          accessToken: "token",
          userId: "7",
          exchangeRate: null,
          authType: AuthTypeEnum.AccessToken,
          checkIn: nextCheckIn,
          siteType: SITE_TYPES.PMAPI,
        },
        nextSiteType: SITE_TYPES.PMAPI,
        nextCheckIn,
        preserveExistingCheckIn: false,
        automaticExecutionPreferenceChanged: optedIn,
        mode: DIALOG_MODES.ADD,
        policy: getAccountDialogSitePolicy(SITE_TYPES.PMAPI),
      })
      expect(merged.checkIn.automaticExecutionEnabled).toBe(optedIn)
    },
  )
  it.each([
    { changed: true, enabled: true, expected: true },
    { changed: true, enabled: false, expected: false },
    { changed: false, enabled: true, expected: false },
  ])(
    "maps unsupported discovery with changed=$changed and enabled=$enabled to $expected",
    ({ changed, enabled, expected }) => {
      const nextCheckIn = buildCheckInConfig({
        automaticExecutionEnabled: false,
        methodKnowledge: {
          methods: {
            [AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn]: {
              detection: {
                outcome: "unsupported",
                evidence: { source: "probe", observedAt: 1_000 },
              },
            },
          },
        },
      })
      const draft = createEmptyAccountDialogDraft(SITE_TYPES.NEW_API)
      draft.checkIn.automaticExecutionEnabled = enabled

      const merged = buildDraftFromAutoDetectResult({
        draft,
        resultData: {
          username: "detected-user",
          siteName: "Detected site",
          accessToken: "detected-token",
          userId: "7",
          exchangeRate: null,
          authType: AuthTypeEnum.AccessToken,
          checkIn: nextCheckIn,
          siteType: SITE_TYPES.NEW_API,
        },
        nextSiteType: SITE_TYPES.NEW_API,
        nextCheckIn,
        preserveExistingCheckIn: false,
        automaticExecutionPreferenceChanged: changed,
        mode: DIALOG_MODES.ADD,
        policy: getAccountDialogSitePolicy(SITE_TYPES.NEW_API),
      })

      expect(merged.checkIn.automaticExecutionEnabled).toBe(expected)
      expect(merged.checkIn.methodKnowledge).toEqual(
        nextCheckIn.methodKnowledge,
      )
    },
  )

  it("uses a known context site type when recovered data reports unknown", () => {
    expect(
      resolveAutoDetectRecovery({
        recoveryData: { siteType: SITE_TYPES.UNKNOWN },
        contextSiteType: SITE_TYPES.NEW_API,
        currentSiteType: SITE_TYPES.UNKNOWN,
        canAdoptSiteType: true,
      }),
    ).toEqual({
      recoveredSiteType: SITE_TYPES.NEW_API,
      shouldAdoptSiteType: true,
      nextSiteType: SITE_TYPES.NEW_API,
    })
  })

  it("fills empty recovery fields without replacing user-owned draft values", () => {
    const draft = {
      ...createEmptyAccountDialogDraft(SITE_TYPES.SUB2API),
      siteName: "User site name",
      siteNameEdited: true,
      username: "user-edited-name",
      authType: AuthTypeEnum.Cookie,
    }

    const merged = mergeAutoDetectRecoveryIntoDraft({
      draft,
      recoveryData: {
        siteName: "Detected site name",
        username: "detected-name",
        userId: "42",
        accessToken: "detected-token",
        authType: AuthTypeEnum.None,
        sub2apiAuth: {
          refreshToken: "detected-refresh-token",
          tokenExpiresAt: 123,
        },
      },
      nextSiteType: SITE_TYPES.SUB2API,
      hasExplicitAuthType: true,
      sub2apiRefreshTokenPreferenceChanged: false,
    })

    expect(merged).toMatchObject({
      siteName: "User site name",
      username: "user-edited-name",
      userId: "42",
      accessToken: "detected-token",
      authType: AuthTypeEnum.AccessToken,
      sub2apiUseRefreshToken: true,
      sub2apiRefreshToken: "detected-refresh-token",
      sub2apiTokenExpiresAt: 123,
    })
  })

  it("preserves an explicit Sub2API refresh-token opt-out during recovery", () => {
    const draft = createEmptyAccountDialogDraft(SITE_TYPES.SUB2API)

    const merged = mergeAutoDetectRecoveryIntoDraft({
      draft,
      recoveryData: {
        sub2apiAuth: {
          refreshToken: "detected-refresh-token",
          tokenExpiresAt: 123,
        },
      },
      nextSiteType: SITE_TYPES.SUB2API,
      hasExplicitAuthType: false,
      sub2apiRefreshTokenPreferenceChanged: true,
    })

    expect(merged).toMatchObject({
      sub2apiUseRefreshToken: false,
      sub2apiRefreshToken: "",
      sub2apiTokenExpiresAt: null,
    })
  })

  it("normalizes recovered check-in data before merging it into the draft", () => {
    const emptyDraft = createEmptyAccountDialogDraft(SITE_TYPES.NEW_API)
    const draft = {
      ...emptyDraft,
      checkIn: {
        ...emptyDraft.checkIn,
        selection: {
          mode: CHECK_IN_SELECTION_MODES.Manual,
          methodId: AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
        },
      },
    }

    const merged = mergeAutoDetectRecoveryIntoDraft({
      draft,
      recoveryData: { checkIn: buildCheckInConfig() },
      nextSiteType: SITE_TYPES.NEW_API,
      hasExplicitAuthType: false,
      sub2apiRefreshTokenPreferenceChanged: false,
    })

    expect(merged.checkIn.selection).toEqual(draft.checkIn.selection)
    expect(merged.checkIn.customCheckIn).toEqual({
      url: "",
      redeemUrl: "",
      openRedeemWithCheckIn: true,
      isCheckedInToday: false,
    })
  })

  it("keeps the edited exchange rate when detection has no replacement", () => {
    const draft = {
      ...createEmptyAccountDialogDraft(SITE_TYPES.NEW_API),
      exchangeRate: "7.5",
    }
    const policy = getAccountDialogSitePolicy(SITE_TYPES.NEW_API)

    const merged = buildDraftFromAutoDetectResult({
      draft,
      resultData: {
        username: "detected-user",
        siteName: "Detected site",
        accessToken: "detected-token",
        userId: "7",
        exchangeRate: null,
        authType: AuthTypeEnum.AccessToken,
        checkIn: buildCheckInConfig(),
        siteType: SITE_TYPES.NEW_API,
      },
      nextSiteType: SITE_TYPES.NEW_API,
      nextCheckIn: buildCheckInConfig(),
      preserveExistingCheckIn: true,
      automaticExecutionPreferenceChanged: false,
      mode: DIALOG_MODES.EDIT,
      policy,
    })

    expect(merged.exchangeRate).toBe("7.5")
  })

  it("recovers kimiOpenPlatformAuth into the draft", () => {
    const draft = createEmptyAccountDialogDraft(SITE_TYPES.KIMI_GLOBAL)
    const merged = mergeAutoDetectRecoveryIntoDraft({
      draft,
      recoveryData: {
        siteType: SITE_TYPES.KIMI_GLOBAL,
        kimiOpenPlatformAuth: {
          refreshToken: "refresh-jwt",
          organizationId: "org-123",
          tokenExpiresAt: 123456789,
        },
      },
      nextSiteType: SITE_TYPES.KIMI_GLOBAL,
      hasExplicitAuthType: false,
      sub2apiRefreshTokenPreferenceChanged: false,
    })

    expect(merged.kimiOpenPlatformAuth).toEqual({
      refreshToken: "refresh-jwt",
      organizationId: "org-123",
      tokenExpiresAt: 123456789,
    })
  })

  it("populates exchangeRate from Kimi auto-detect result in add mode", () => {
    const draft = createEmptyAccountDialogDraft(SITE_TYPES.UNKNOWN)
    const policy = getAccountDialogSitePolicy(SITE_TYPES.KIMI)

    const merged = buildDraftFromAutoDetectResult({
      draft,
      resultData: {
        username: "kimi-user",
        siteName: "Kimi",
        accessToken: "detected-jwt",
        userId: "kimi-1",
        exchangeRate: 7.2,
        authType: AuthTypeEnum.AccessToken,
        checkIn: buildCheckInConfig(),
        siteType: SITE_TYPES.KIMI,
        kimiOpenPlatformAuth: {
          refreshToken: "refresh-jwt",
          organizationId: "org-1",
        },
      },
      nextSiteType: SITE_TYPES.KIMI,
      nextCheckIn: buildCheckInConfig(),
      preserveExistingCheckIn: false,
      automaticExecutionPreferenceChanged: false,
      mode: DIALOG_MODES.ADD,
      policy,
    })

    expect(merged.exchangeRate).toBe("7.2")
    expect(merged.siteType).toBe(SITE_TYPES.KIMI)
  })
})

it.each([false, true])(
  "adopts detected login only when the new-account login was not edited (changed=%s)",
  (changed) => {
    const draft = createEmptyAccountDialogDraft(SITE_TYPES.NEW_API)
    draft.loginChanged = changed
    const login = { methodId: "github" }
    const nextCheckIn = buildCheckInConfig()
    const merged = buildDraftFromAutoDetectResult({
      draft,
      resultData: {
        username: "user",
        siteName: "Detected",
        accessToken: "token",
        userId: "7",
        exchangeRate: null,
        authType: AuthTypeEnum.AccessToken,
        checkIn: nextCheckIn,
        siteType: SITE_TYPES.NEW_API,
        login,
      },
      nextSiteType: SITE_TYPES.NEW_API,
      nextCheckIn,
      preserveExistingCheckIn: false,
      automaticExecutionPreferenceChanged: false,
      mode: DIALOG_MODES.ADD,
      policy: getAccountDialogSitePolicy(SITE_TYPES.NEW_API),
    })
    expect(merged.login).toEqual(changed ? undefined : login)
    expect(merged.loginChanged).toBe(true)
  },
)
it.each([false, true])(
  "recovery preserves explicitly edited login (changed=%s)",
  (changed) => {
    const draft = createEmptyAccountDialogDraft(SITE_TYPES.NEW_API)
    draft.loginChanged = changed
    const login = { methodId: "github" }
    const merged = mergeAutoDetectRecoveryIntoDraft({
      draft,
      recoveryData: { login },
      nextSiteType: SITE_TYPES.NEW_API,
      hasExplicitAuthType: false,
      sub2apiRefreshTokenPreferenceChanged: false,
    })
    expect(merged.login).toEqual(changed ? undefined : login)
    expect(merged.loginChanged).toBe(true)
  },
)
