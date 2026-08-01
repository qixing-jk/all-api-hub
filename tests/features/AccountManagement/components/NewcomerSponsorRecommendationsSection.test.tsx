import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { NewcomerSponsorRecommendationsSection } from "~/features/AccountManagement/components/NewcomerSponsorRecommendationsSection"
import { SPONSOR_CATALOG_SCHEMA_VERSION } from "~/features/AccountManagement/sponsors/constants"
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
    links: {
      primary: "https://supported.example.test/register",
    },
    actions: {
      addAccount: {
        siteType: SITE_TYPES.NEW_API,
        siteUrl: "https://supported.example.test",
        authType: AuthTypeEnum.Cookie,
      },
    },
    schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
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
    postClickNote: "Use promo code APIHUB after registration.",
    links: {
      primary: "https://manual.example.com/register",
    },
    actions: {
      bookmarkFallback: {
        url: "https://manual.example.com",
      },
      apiCredentialProfileFallback: {
        baseUrl: "https://manual.example.com",
        apiKeyCreateUrl: "https://manual.example.com/keys?ref=all-api-hub",
        apiKeyCreateHint: "Use promo code APIHUB after registration.",
      },
    },
    schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
    source: SPONSOR_CATALOG_SOURCES.Bundled,
    rank: 2,
  }
}

function renderNewcomerSponsorRecommendationsSection() {
  return render(<NewcomerSponsorRecommendationsSection />, {
    withReleaseUpdateStatusProvider: false,
    withThemeProvider: false,
    withUserPreferencesProvider: false,
  })
}

describe("NewcomerSponsorRecommendationsSection", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    setSponsorRecommendations([createSupportedSponsor()])
    mockUseSponsorRecommendations.mockReturnValue({
      isLoading: false,
      items: mockSponsorRecommendationItems,
    })
  })

  it("shows focused sponsor guidance without the generic welcome actions", async () => {
    renderNewcomerSponsorRecommendationsSection()

    expect(await screen.findByText("Supported Provider")).toBeInTheDocument()
    expect(
      screen.getByRole("region", {
        name: "account:sponsor.newcomer.title",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText("account:sponsor.newcomer.description"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("account:sponsor.newcomer.disclosure"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("account:newcomerSupport.title"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "account:newcomerSupport.actions.star",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "account:newcomerSupport.actions.docs",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "account:newcomerSupport.actions.about",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "account:addFirstAccount" }),
    ).not.toBeInTheDocument()
  })

  it("renders nothing when no sponsor recommendations are available", () => {
    setSponsorRecommendations([])

    renderNewcomerSponsorRecommendationsSection()

    expect(
      screen.queryByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.sponsorRecommendations),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("account:newcomerSupport.description"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "account:newcomerSupport.actions.star",
      }),
    ).not.toBeInTheDocument()
  })

  it("continues supported sponsors with the sponsor add-account prefill", async () => {
    const user = userEvent.setup()
    const openSpy = vi.fn()
    vi.stubGlobal("open", openSpy)

    renderNewcomerSponsorRecommendationsSection()

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

    renderNewcomerSponsorRecommendationsSection()

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
})
