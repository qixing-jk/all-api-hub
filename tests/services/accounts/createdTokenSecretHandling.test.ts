import { afterEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createLegacyCreatedRuntimeSecret } from "~/services/accounts/createdRuntimeSecret"
import {
  createDisplayAccountTokenRuntimeSecret,
  shouldShowOneTimeKeyDialogForAccount,
  shouldShowOneTimeKeyDialogForCreatedToken,
} from "~/services/accounts/createdTokenSecretHandling"
import * as registry from "~/services/apiAdapters/registry"
import {
  buildApiToken,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"

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

describe("created secret projection", () => {
  afterEach(() => vi.restoreAllMocks())
  it("projects a newly created secret through the registered capability independently of the site name", () => {
    const account = buildDisplaySiteData({ siteType: SITE_TYPES.NEW_API })
    const token = buildApiToken({ key: "created-response-secret" })
    const secret = createLegacyCreatedRuntimeSecret({ account, token })
    const project = vi.fn().mockReturnValue(secret)
    vi.spyOn(registry, "getSiteTypeCapabilities").mockReturnValue({
      account: { keyManagement: { createRuntimeSecret: project } },
    } as any)
    expect(createDisplayAccountTokenRuntimeSecret({ account, token })).toBe(
      secret,
    )
    expect(project).toHaveBeenCalledWith({ account, token })
  })

  it("rejects foreground handoff when no secret projection is registered instead of falling back to a provider", () => {
    vi.spyOn(registry, "getSiteTypeCapabilities").mockReturnValue({
      siteType: SITE_TYPES.AIHUBMIX,
      account: {},
    })
    const account = buildDisplaySiteData({ siteType: SITE_TYPES.AIHUBMIX })
    const token = buildApiToken({ key: "created-response-secret" })
    expect(() =>
      createDisplayAccountTokenRuntimeSecret({ account, token }),
    ).toThrow("Created token secret projection is unavailable")
  })
})
