import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  mergeAutoDetectRecoveryIntoDraft,
  resolveAutoDetectRecovery,
} from "~/features/AccountManagement/components/AccountDialog/autoDetectDraft"
import { createEmptyAccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import { AuthTypeEnum } from "~/types"

describe("account dialog auto-detect draft mapping", () => {
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
      retainedRecoveryData: { siteType: SITE_TYPES.NEW_API },
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
})
