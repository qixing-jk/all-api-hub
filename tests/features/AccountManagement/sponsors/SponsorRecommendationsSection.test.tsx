import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  SPONSOR_CATALOG_SCHEMA_VERSION,
  SPONSOR_RECOMMENDATION_SURFACES,
  type SponsorRecommendationSurface,
} from "~/features/AccountManagement/sponsors/constants"
import { SponsorRecommendationsSection } from "~/features/AccountManagement/sponsors/SponsorRecommendationsSection"
import {
  SPONSOR_CATALOG_SOURCES,
  SPONSOR_SUPPORT_STATUS,
  type SponsorRecommendation,
} from "~/features/AccountManagement/sponsors/types"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { PRODUCT_ANALYTICS_EVENTS } from "~/services/productAnalytics/events"
import { AuthTypeEnum } from "~/types"
import { render, screen } from "~~/tests/test-utils/render"

const { trackProductAnalyticsEventMock } = vi.hoisted(() => ({
  trackProductAnalyticsEventMock: vi.fn(),
}))

vi.mock("~/services/productAnalytics/events", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/events")>()

  return {
    ...actual,
    trackProductAnalyticsEvent: (...args: unknown[]) =>
      trackProductAnalyticsEventMock(...args),
  }
})

const onContinueAddAccount = vi.fn()
const onOpenBookmarkManager = vi.fn()
const onOpenApiCredentialProfiles = vi.fn()

function renderSection(
  items: SponsorRecommendation[],
  surface: SponsorRecommendationSurface = SPONSOR_RECOMMENDATION_SURFACES.AddAccountDialog,
) {
  return render(
    <SponsorRecommendationsSection
      surface={surface}
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

function createSupportedSponsor(
  overrides: Partial<SponsorRecommendation> = {},
): SponsorRecommendation {
  return {
    id: "supported-provider",
    name: "Supported Provider",
    tagline: "Supported provider.",
    supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
    links: {
      primary: "https://supported.example.invalid/register",
    },
    actions: {
      addAccount: {
        siteType: SITE_TYPES.NEW_API,
        siteUrl: "https://supported.example.invalid",
        authType: AuthTypeEnum.Cookie,
      },
    },
    schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
    selectedLocale: "en",
    source: SPONSOR_CATALOG_SOURCES.Bundled,
    rank: 1,
    ...overrides,
  }
}

function createUnsupportedSponsor(
  overrides: Partial<SponsorRecommendation> = {},
): SponsorRecommendation {
  return {
    id: "manual-provider",
    name: "Manual Provider",
    tagline:
      "Manual setup required with an extended description for two-line sponsor copy.",
    postClickNote: "Create a key in the example console.",
    supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
    links: {
      primary: "https://manual.example.invalid/register",
    },
    actions: {
      bookmarkFallback: {
        url: "https://docs.manual.example.invalid/get-started",
      },
      apiCredentialProfileFallback: {
        baseUrl: "https://api.manual.example.invalid/v1",
        apiKeyCreateUrl: "https://console.manual.example.invalid/keys",
        apiKeyCreateHint: "Create a key in the example console.",
      },
    },
    schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
    selectedLocale: "en",
    source: SPONSOR_CATALOG_SOURCES.Bundled,
    rank: 2,
    ...overrides,
  }
}

describe("SponsorRecommendationsSection", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    trackProductAnalyticsEventMock.mockReset()
    onContinueAddAccount.mockReset()
    onOpenBookmarkManager.mockReset()
    onOpenApiCredentialProfiles.mockReset()
  })

  it("renders supported sponsor as a compact continuation row with a provider link", async () => {
    const user = userEvent.setup()
    const openSpy = vi.fn()
    vi.stubGlobal("open", openSpy)

    renderSection([createSupportedSponsor()])

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
      siteUrl: "https://supported.example.invalid",
      siteType: SITE_TYPES.NEW_API,
      authType: AuthTypeEnum.Cookie,
      source: "sponsor",
      sponsorId: "supported-provider",
    })
    expect(openSpy).toHaveBeenCalledWith(
      "https://supported.example.invalid/register",
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
      createSupportedSponsor({
        actions: {
          addAccount: {
            siteType: SITE_TYPES.NEW_API,
            siteUrl: "https://supported.example.invalid",
          },
        },
      }),
    ])

    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.sponsorContinueAddAccountAction,
      ),
    )

    expect(onContinueAddAccount).toHaveBeenCalledWith({
      siteUrl: "https://supported.example.invalid",
      siteType: SITE_TYPES.NEW_API,
      source: "sponsor",
      sponsorId: "supported-provider",
    })
  })

  it("renders unsupported sponsor fallback actions as secondary guidance without site-support requests", async () => {
    const user = userEvent.setup()
    const openSpy = vi.fn()
    vi.stubGlobal("open", openSpy)

    renderSection([createUnsupportedSponsor()])

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
      url: "https://docs.manual.example.invalid/get-started",
    })
    expect(onOpenApiCredentialProfiles).toHaveBeenCalledWith({
      name: "Manual Provider",
      baseUrl: "https://api.manual.example.invalid/v1",
      apiKeyCreateUrl: "https://console.manual.example.invalid/keys",
      apiKeyCreateHint: "Create a key in the example console.",
    })
    expect(openSpy).toHaveBeenCalledTimes(2)
    expect(openSpy).toHaveBeenNthCalledWith(
      1,
      "https://manual.example.invalid/register",
      "_blank",
      "noopener,noreferrer",
    )
    expect(openSpy).toHaveBeenNthCalledWith(
      2,
      "https://manual.example.invalid/register",
      "_blank",
      "noopener,noreferrer",
    )
  })

  it("opens the provider URL directly when unsupported sponsors have no fallback actions", async () => {
    const user = userEvent.setup()
    const openSpy = vi.fn()
    vi.stubGlobal("open", openSpy)

    renderSection([
      createUnsupportedSponsor({
        tagline: "Manual setup required.",
        links: {
          primary: "https://manual.example.invalid/register",
        },
        actions: {},
        postClickNote: undefined,
      }),
    ])

    await user.click(
      screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.sponsorPrimaryAction),
    )

    expect(openSpy).toHaveBeenCalledWith(
      "https://manual.example.invalid/register",
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
      createUnsupportedSponsor({
        id: "bookmark-provider",
        name: "Bookmark Provider",
        tagline: "Bookmark first.",
        links: {
          primary: "https://bookmark.example.invalid/register",
        },
        actions: {
          bookmarkFallback: {
            url: "https://docs.bookmark.example.invalid/get-started",
          },
        },
        postClickNote: undefined,
      }),
      createUnsupportedSponsor({
        id: "api-provider",
        name: "API Provider",
        tagline: "API credential first.",
        links: {
          primary: "https://api.example.invalid/register",
        },
        actions: {
          apiCredentialProfileFallback: {
            baseUrl: "https://api.example.invalid/v1",
          },
        },
        postClickNote: undefined,
        rank: 3,
      }),
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
      url: "https://docs.bookmark.example.invalid/get-started",
    })
    expect(onOpenApiCredentialProfiles).toHaveBeenCalledWith({
      name: "API Provider",
      baseUrl: "https://api.example.invalid/v1",
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

  it("tracks one safe impression for a non-empty rendered recommendation set without rerender duplicates", () => {
    const { rerender } = renderSection([
      createSupportedSponsor(),
      createUnsupportedSponsor({
        id: "cached-provider",
        source: SPONSOR_CATALOG_SOURCES.Cached,
        rank: 2,
      }),
    ])

    rerender(
      <SponsorRecommendationsSection
        surface={SPONSOR_RECOMMENDATION_SURFACES.AddAccountDialog}
        items={[
          createSupportedSponsor(),
          createUnsupportedSponsor({
            id: "cached-provider",
            source: SPONSOR_CATALOG_SOURCES.Cached,
            rank: 2,
          }),
        ]}
        onContinueAddAccount={onContinueAddAccount}
        onOpenBookmarkManager={onOpenBookmarkManager}
        onOpenApiCredentialProfiles={onOpenApiCredentialProfiles}
      />,
    )

    expect(trackProductAnalyticsEventMock).toHaveBeenCalledTimes(1)
    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      expect.objectContaining({
        feature_id: "sponsor_recommendations",
        action_id: "view_sponsor_recommendations",
        surface_id:
          "options_account_management_add_account_sponsor_recommendations",
        entrypoint: "options",
        result: "success",
        item_count: 2,
        sponsor_catalog_source: "mixed",
        sponsor_supported_count: 1,
        sponsor_unsupported_count: 1,
      }),
    )
  })

  it("does not track impressions when no recommendations are available", () => {
    renderSection([])

    expect(trackProductAnalyticsEventMock).not.toHaveBeenCalled()
  })

  it("tracks newcomer recommendation impressions with a distinct surface", () => {
    renderSection(
      [createSupportedSponsor()],
      SPONSOR_RECOMMENDATION_SURFACES.Newcomer,
    )

    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      expect.objectContaining({
        action_id: "view_sponsor_recommendations",
        surface_id:
          "options_account_management_newcomer_sponsor_recommendations",
      }),
    )
  })

  it("tracks safe sponsor click metadata without leaking URLs, provider names, or promo notes", async () => {
    const user = userEvent.setup()
    vi.stubGlobal("open", vi.fn())
    renderSection([
      createSupportedSponsor(),
      createUnsupportedSponsor({
        id: "remote-provider",
        source: SPONSOR_CATALOG_SOURCES.Remote,
        rank: 2,
      }),
    ])
    trackProductAnalyticsEventMock.mockClear()

    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.sponsorContinueAddAccountAction,
      ),
    )
    await user.click(
      screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.sponsorPrimaryAction),
    )
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

    expect(trackProductAnalyticsEventMock).toHaveBeenCalledTimes(4)
    expect(trackProductAnalyticsEventMock).toHaveBeenNthCalledWith(
      1,
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      expect.objectContaining({
        feature_id: "sponsor_recommendations",
        action_id: "open_sponsor_add_account_followup",
        surface_id:
          "options_account_management_add_account_sponsor_recommendations",
        sponsor_action_kind: "continue_add_account",
        sponsor_support_status: "supported",
        sponsor_catalog_source: "bundled",
        sponsor_rank: 1,
        item_count: 2,
      }),
    )
    expect(trackProductAnalyticsEventMock).toHaveBeenNthCalledWith(
      2,
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      expect.objectContaining({
        action_id: "open_sponsor_provider",
        sponsor_action_kind: "visit_provider",
        sponsor_support_status: "unsupported",
        sponsor_catalog_source: "remote",
        sponsor_rank: 2,
        item_count: 2,
      }),
    )
    expect(trackProductAnalyticsEventMock).toHaveBeenNthCalledWith(
      3,
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      expect.objectContaining({
        action_id: "open_sponsor_bookmark_followup",
        sponsor_action_kind: "bookmark_fallback",
      }),
    )
    expect(trackProductAnalyticsEventMock).toHaveBeenNthCalledWith(
      4,
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      expect.objectContaining({
        action_id: "open_sponsor_api_credentials_followup",
        sponsor_action_kind: "api_credential_profiles_fallback",
      }),
    )

    const payloadText = JSON.stringify(
      trackProductAnalyticsEventMock.mock.calls,
    )
    expect(payloadText).not.toContain("https://")
    expect(payloadText).not.toContain("Supported Provider")
    expect(payloadText).not.toContain("Manual Provider")
    expect(payloadText).not.toContain("supported-provider")
    expect(payloadText).not.toContain("remote-provider")
    expect(payloadText).not.toContain("Create a key in the example console.")
    expect(payloadText).not.toContain("example.invalid")
  })

  it("tracks newcomer recommendation clicks with a distinct surface", async () => {
    const user = userEvent.setup()
    vi.stubGlobal("open", vi.fn())
    renderSection(
      [createSupportedSponsor()],
      SPONSOR_RECOMMENDATION_SURFACES.Newcomer,
    )
    trackProductAnalyticsEventMock.mockClear()

    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.sponsorContinueAddAccountAction,
      ),
    )

    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      expect.objectContaining({
        action_id: "open_sponsor_add_account_followup",
        surface_id:
          "options_account_management_newcomer_sponsor_recommendations",
        sponsor_action_kind: "continue_add_account",
      }),
    )
  })
})
