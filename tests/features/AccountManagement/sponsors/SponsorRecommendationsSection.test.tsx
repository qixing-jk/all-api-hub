import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { SPONSOR_RECOMMENDATION_SURFACES } from "~/features/AccountManagement/sponsors/constants"
import { SponsorRecommendationsSection } from "~/features/AccountManagement/sponsors/SponsorRecommendationsSection"
import {
  SPONSOR_CATALOG_SOURCES,
  SPONSOR_SUPPORT_STATUS,
  type SponsorRecommendation,
} from "~/features/AccountManagement/sponsors/types"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { AuthTypeEnum } from "~/types"
import { render, screen } from "~~/tests/test-utils/render"

const onContinueAddAccount = vi.fn()
const onOpenBookmarkManager = vi.fn()
const onOpenApiCredentialProfiles = vi.fn()

function renderSection(items: SponsorRecommendation[]) {
  return render(
    <SponsorRecommendationsSection
      surface={SPONSOR_RECOMMENDATION_SURFACES.AddAccountDialog}
      items={items}
      onContinueAddAccount={onContinueAddAccount}
      onOpenBookmarkManager={onOpenBookmarkManager}
      onOpenApiCredentialProfiles={onOpenApiCredentialProfiles}
    />,
    {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    },
  )
}

describe("SponsorRecommendationsSection", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    onContinueAddAccount.mockReset()
    onOpenBookmarkManager.mockReset()
    onOpenApiCredentialProfiles.mockReset()
  })

  it("renders supported sponsor as a compact continuation row with a provider link", async () => {
    const user = userEvent.setup()
    const openSpy = vi.fn()
    vi.stubGlobal("open", openSpy)

    renderSection([
      {
        id: "supported-provider",
        name: "Supported Provider",
        tagline: "Supported provider.",
        primaryAffiliateUrl: "https://supported.example.test/register",
        supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
        accountPrefill: {
          siteType: SITE_TYPES.NEW_API,
          siteUrl: "https://supported.example.test",
          authType: AuthTypeEnum.Cookie,
        },
        fallbackHints: {
          bookmarkManager: false,
          apiCredentialProfiles: false,
        },
        source: SPONSOR_CATALOG_SOURCES.Bundled,
        rank: 1,
      },
    ])

    expect(screen.getByText("Supported Provider")).toBeInTheDocument()
    expect(
      screen.queryByText(/account:sponsor.supportStatus.accountReady/),
    ).not.toBeInTheDocument()
    expect(screen.getByText("Supported provider.")).toBeInTheDocument()
    expect(
      screen.getByRole("region", {
        name: "account:sponsor.recommendedProviders",
      }),
    ).toBeInTheDocument()
    const continueAction = screen.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.sponsorContinueAddAccountAction,
    )

    expect(continueAction).toHaveAttribute("type", "button")

    await user.click(continueAction)

    expect(onContinueAddAccount).toHaveBeenCalledWith({
      siteUrl: "https://supported.example.test",
      siteType: SITE_TYPES.NEW_API,
      authType: AuthTypeEnum.Cookie,
      source: "sponsor",
      sponsorId: "supported-provider",
    })
    expect(openSpy).toHaveBeenCalledWith(
      "https://supported.example.test/register",
      "_blank",
      "noopener,noreferrer",
    )
    expect(
      screen.queryByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.sponsorPrimaryAction),
    ).not.toBeInTheDocument()
  })

  it("omits optional auth type from sponsor add-account prefill when none is provided", async () => {
    const user = userEvent.setup()
    const openSpy = vi.fn()
    vi.stubGlobal("open", openSpy)

    renderSection([
      {
        id: "supported-provider",
        name: "Supported Provider",
        tagline: "Supported provider.",
        primaryAffiliateUrl: "https://supported.example.test/register",
        supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
        accountPrefill: {
          siteType: SITE_TYPES.NEW_API,
          siteUrl: "https://supported.example.test",
        },
        fallbackHints: {
          bookmarkManager: false,
          apiCredentialProfiles: false,
        },
        source: SPONSOR_CATALOG_SOURCES.Bundled,
        rank: 1,
      },
    ])

    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.sponsorContinueAddAccountAction,
      ),
    )

    expect(onContinueAddAccount).toHaveBeenCalledWith({
      siteUrl: "https://supported.example.test",
      siteType: SITE_TYPES.NEW_API,
      source: "sponsor",
      sponsorId: "supported-provider",
    })
  })

  it("renders unsupported sponsor fallback actions as secondary guidance without site-support requests", async () => {
    const user = userEvent.setup()
    const openSpy = vi.fn()
    vi.stubGlobal("open", openSpy)

    renderSection([
      {
        id: "manual-provider",
        name: "Manual Provider",
        tagline:
          "Manual setup required with an extended description for two-line sponsor copy.",
        primaryAffiliateUrl:
          "https://manual.example.com/register?aff=all-api-hub",
        websiteUrl: "https://manual.example.com/dashboard",
        apiKeyCreateUrl: "https://manual.example.com/keys?aff=all-api-hub",
        postClickNote: "Use promo code APIHUB after registration.",
        supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
        fallbackHints: {
          bookmarkManager: true,
          apiCredentialProfiles: true,
        },
        source: SPONSOR_CATALOG_SOURCES.Bundled,
        rank: 2,
      },
    ])

    expect(
      screen.queryByText("account:sponsor.supportStatus.unsupported"),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(
        "Manual setup required with an extended description for two-line sponsor copy.",
      ),
    ).toHaveClass("line-clamp-2")
    expect(
      screen.getByText("account:sponsor.supportStatus.fallbackBookmarkAndApi"),
    ).toHaveClass("bg-blue-100")
    expect(
      screen.queryByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.sponsorContinueAddAccountAction,
      ),
    ).not.toBeInTheDocument()

    expect(
      screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.sponsorPrimaryAction),
    ).toHaveAttribute("type", "button")

    const bookmarkAction = screen.getByRole("button", {
      name: "account:sponsor.actions.openBookmarkManagerFallback",
    })
    const apiCredentialProfilesAction = screen.getByRole("button", {
      name: "account:sponsor.actions.openApiCredentialProfilesFallback",
    })

    expect(bookmarkAction).toHaveAttribute("type", "button")
    expect(apiCredentialProfilesAction).toHaveAttribute("type", "button")

    await user.click(bookmarkAction)
    await user.click(apiCredentialProfilesAction)

    expect(onOpenBookmarkManager).toHaveBeenCalledTimes(1)
    expect(onOpenApiCredentialProfiles).toHaveBeenCalledTimes(1)
    expect(onOpenBookmarkManager).toHaveBeenCalledWith({
      name: "Manual Provider",
      url: "https://manual.example.com/dashboard",
    })
    expect(onOpenApiCredentialProfiles).toHaveBeenCalledWith({
      name: "Manual Provider",
      baseUrl: "https://manual.example.com/dashboard",
      apiKeyCreateUrl: "https://manual.example.com/keys?aff=all-api-hub",
      apiKeyCreateHint: "Use promo code APIHUB after registration.",
    })
    expect(openSpy).toHaveBeenCalledTimes(2)
    expect(openSpy).toHaveBeenNthCalledWith(
      1,
      "https://manual.example.com/register?aff=all-api-hub",
      "_blank",
      "noopener,noreferrer",
    )
    expect(openSpy).toHaveBeenNthCalledWith(
      2,
      "https://manual.example.com/register?aff=all-api-hub",
      "_blank",
      "noopener,noreferrer",
    )
  })

  it("opens the provider URL directly when unsupported sponsors have no fallback actions", async () => {
    const user = userEvent.setup()
    const openSpy = vi.fn()
    vi.stubGlobal("open", openSpy)

    renderSection([
      {
        id: "manual-provider",
        name: "Manual Provider",
        tagline: "Manual setup required.",
        primaryAffiliateUrl: "https://manual.example.com/register",
        supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
        fallbackHints: {
          bookmarkManager: false,
          apiCredentialProfiles: false,
        },
        source: SPONSOR_CATALOG_SOURCES.Bundled,
        rank: 2,
      },
    ])

    await user.click(
      screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.sponsorPrimaryAction),
    )

    expect(openSpy).toHaveBeenCalledWith(
      "https://manual.example.com/register",
      "_blank",
      "noopener,noreferrer",
    )
    expect(onOpenBookmarkManager).not.toHaveBeenCalled()
    expect(onOpenApiCredentialProfiles).not.toHaveBeenCalled()
  })

  it("routes single fallback actions through the provider URL fallback", async () => {
    const user = userEvent.setup()
    const openSpy = vi.fn()
    vi.stubGlobal("open", openSpy)

    renderSection([
      {
        id: "bookmark-provider",
        name: "Bookmark Provider",
        tagline: "Bookmark first.",
        primaryAffiliateUrl: "https://bookmark.example.com/register",
        supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
        fallbackHints: {
          bookmarkManager: true,
          apiCredentialProfiles: false,
        },
        source: SPONSOR_CATALOG_SOURCES.Bundled,
        rank: 2,
      },
      {
        id: "api-provider",
        name: "API Provider",
        tagline: "API credential first.",
        primaryAffiliateUrl: "https://api.example.com/register",
        supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
        fallbackHints: {
          bookmarkManager: false,
          apiCredentialProfiles: true,
        },
        source: SPONSOR_CATALOG_SOURCES.Bundled,
        rank: 3,
      },
    ])

    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.sponsorFallbackBookmarkAction,
      ),
    )
    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.sponsorFallbackApiCredentialProfilesAction,
      ),
    )

    expect(onOpenBookmarkManager).toHaveBeenCalledWith({
      name: "Bookmark Provider",
      url: "https://bookmark.example.com/register",
    })
    expect(onOpenApiCredentialProfiles).toHaveBeenCalledWith({
      name: "API Provider",
      baseUrl: "https://api.example.com/register",
      apiKeyCreateUrl: undefined,
      apiKeyCreateHint: undefined,
    })
    expect(openSpy).toHaveBeenCalledTimes(2)
  })

  it("renders nothing when no recommendations are available", () => {
    renderSection([])

    expect(
      screen.queryByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.sponsorRecommendations),
    ).not.toBeInTheDocument()
  })
})
