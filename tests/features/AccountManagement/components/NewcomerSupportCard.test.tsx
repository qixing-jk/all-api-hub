import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { NewcomerSupportCard } from "~/features/AccountManagement/components/NewcomerSupportCard"
import {
  SPONSOR_CATALOG_SOURCES,
  SPONSOR_SUPPORT_STATUS,
  type SponsorRecommendation,
} from "~/features/AccountManagement/sponsors/types"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { AuthTypeEnum } from "~/types"
import { render, screen } from "~~/tests/test-utils/render"

const {
  mockOpenAddAccount,
  mockOpenApiCredentialProfilesPage,
  mockOpenFullBookmarkManagerPage,
  mockOpenSiteSupportRequestPage,
  mockSponsorRecommendationItems,
  mockUseSponsorRecommendations,
} = vi.hoisted(() => ({
  mockOpenAddAccount: vi.fn(),
  mockOpenApiCredentialProfilesPage: vi.fn(),
  mockOpenFullBookmarkManagerPage: vi.fn(),
  mockOpenSiteSupportRequestPage: vi.fn(),
  mockSponsorRecommendationItems: [] as SponsorRecommendation[],
  mockUseSponsorRecommendations: vi.fn(() => ({
    isLoading: false,
    items: mockSponsorRecommendationItems,
  })),
}))

vi.mock("~/features/AccountManagement/hooks/DialogStateContext", () => ({
  useDialogStateContext: () => ({
    openAddAccount: mockOpenAddAccount,
  }),
}))

vi.mock(
  "~/features/AccountManagement/sponsors/useSponsorRecommendations",
  () => ({
    useSponsorRecommendations: mockUseSponsorRecommendations,
  }),
)

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()

  return {
    ...actual,
    openApiCredentialProfilesPage: mockOpenApiCredentialProfilesPage,
    openFullBookmarkManagerPage: mockOpenFullBookmarkManagerPage,
    openSiteSupportRequestPage: mockOpenSiteSupportRequestPage,
  }
})

function setSponsorRecommendations(items: SponsorRecommendation[]) {
  mockSponsorRecommendationItems.splice(
    0,
    mockSponsorRecommendationItems.length,
  )
  mockSponsorRecommendationItems.push(...items)
}

function createSupportedSponsor(): SponsorRecommendation {
  return {
    id: "supported-provider",
    name: "Supported Provider",
    tagline: "Supported provider.",
    supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
    primaryAffiliateUrl: "https://supported.example.test/register",
    websiteUrl: "https://supported.example.test",
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
  }
}

function createUnsupportedSponsor(): SponsorRecommendation {
  return {
    id: "manual-provider",
    name: "Manual Provider",
    tagline: "Manual setup required.",
    supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
    primaryAffiliateUrl: "https://manual.example.com/register",
    websiteUrl: "https://manual.example.com",
    apiKeyCreateUrl: "https://manual.example.com/keys?ref=all-api-hub",
    postClickNote: "Use promo code APIHUB after registration.",
    fallbackHints: {
      bookmarkManager: true,
      apiCredentialProfiles: true,
    },
    source: SPONSOR_CATALOG_SOURCES.Bundled,
    rank: 2,
  }
}

function renderNewcomerSupportCard() {
  return render(<NewcomerSupportCard />, {
    withReleaseUpdateStatusProvider: false,
    withThemeProvider: false,
    withUserPreferencesProvider: false,
  })
}

describe("NewcomerSupportCard", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    setSponsorRecommendations([createSupportedSponsor()])
    mockUseSponsorRecommendations.mockReturnValue({
      isLoading: false,
      items: mockSponsorRecommendationItems,
    })
  })

  it("shows the original button group before sponsor recommendations", async () => {
    renderNewcomerSupportCard()

    expect(await screen.findByText("Supported Provider")).toBeInTheDocument()
    const starButton = screen.getByRole("button", {
      name: "account:newcomerSupport.actions.star",
    })
    const sponsorRecommendations = screen.getByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.sponsorRecommendations,
    )

    expect(starButton.compareDocumentPosition(sponsorRecommendations)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(
      screen.queryByRole("button", { name: "account:addFirstAccount" }),
    ).not.toBeInTheDocument()
  })

  it("continues supported sponsors with the sponsor add-account prefill", async () => {
    const user = userEvent.setup()
    const openSpy = vi.fn()
    vi.stubGlobal("open", openSpy)

    renderNewcomerSupportCard()

    await user.click(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.sponsorContinueAddAccountAction,
      ),
    )

    expect(mockOpenAddAccount).toHaveBeenCalledWith({
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
  })

  it("routes unsupported sponsor fallback actions through account-management helpers without support requests", async () => {
    const user = userEvent.setup()
    vi.stubGlobal("open", vi.fn())
    setSponsorRecommendations([createUnsupportedSponsor()])

    renderNewcomerSupportCard()

    await user.click(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.sponsorFallbackBookmarkAction,
      ),
    )
    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.sponsorFallbackApiCredentialProfilesAction,
      ),
    )

    expect(mockOpenSiteSupportRequestPage).not.toHaveBeenCalled()
    expect(mockOpenFullBookmarkManagerPage).toHaveBeenCalledWith({
      create: {
        name: "Manual Provider",
        url: "https://manual.example.com",
      },
    })
    expect(mockOpenApiCredentialProfilesPage).toHaveBeenCalledWith({
      create: {
        name: "Manual Provider",
        baseUrl: "https://manual.example.com",
        apiKeyCreateUrl: "https://manual.example.com/keys?ref=all-api-hub",
        apiKeyCreateHint: "Use promo code APIHUB after registration.",
      },
    })
  })

  it("preserves the docs, repo, and about fallback layout when no sponsors are available", () => {
    setSponsorRecommendations([])

    renderNewcomerSupportCard()

    expect(
      screen.queryByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.sponsorRecommendations),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText("account:newcomerSupport.description"),
    ).toBeInTheDocument()
    expect(screen.getByText("account:newcomerSupport.hint")).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "account:newcomerSupport.actions.star",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "account:newcomerSupport.actions.docs",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "account:newcomerSupport.actions.about",
      }),
    ).toBeInTheDocument()
  })
})
