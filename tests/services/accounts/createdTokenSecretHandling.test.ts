import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  shouldShowOneTimeKeyDialogForAccount,
  shouldShowOneTimeKeyDialogForCreatedToken,
} from "~/services/accounts/createdTokenSecretHandling"

describe("created token secret handling", () => {
  describe("shouldShowOneTimeKeyDialogForAccount", () => {
    it("shows the one-time key dialog for AIHubMix create responses", () => {
      expect(
        shouldShowOneTimeKeyDialogForAccount({
          siteType: SITE_TYPES.AIHUBMIX,
        }),
      ).toBe(true)
    })

    it("does not force a one-time key dialog for Sub2API create responses", () => {
      expect(
        shouldShowOneTimeKeyDialogForAccount({
          siteType: SITE_TYPES.SUB2API,
        }),
      ).toBe(false)
    })
  })

  describe("shouldShowOneTimeKeyDialogForCreatedToken", () => {
    it("requires an AIHubMix account and a usable unmasked secret", () => {
      expect(
        shouldShowOneTimeKeyDialogForCreatedToken(
          { siteType: SITE_TYPES.AIHUBMIX },
          { key: "sk-aihubmix-full-secret" },
        ),
      ).toBe(true)
    })

    it("does not show the dialog for masked AIHubMix created keys", () => {
      expect(
        shouldShowOneTimeKeyDialogForCreatedToken(
          { siteType: SITE_TYPES.AIHUBMIX },
          { key: "sk-aihub********masked" },
        ),
      ).toBe(false)
    })

    it("does not show the dialog for full Sub2API created keys", () => {
      expect(
        shouldShowOneTimeKeyDialogForCreatedToken(
          { siteType: SITE_TYPES.SUB2API },
          { key: "sk-sub2api-full-secret" },
        ),
      ).toBe(false)
    })
  })
})
