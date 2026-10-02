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
} from "~/features/AccountManagement/components/AccountDialog/autoDetectDraft"
import { createEmptyAccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import { getAccountDialogSitePolicy } from "~/features/AccountManagement/components/AccountDialog/sitePolicy"
import { AuthTypeEnum } from "~/types"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

describe("account dialog auto-detect draft mapping", () => {
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
