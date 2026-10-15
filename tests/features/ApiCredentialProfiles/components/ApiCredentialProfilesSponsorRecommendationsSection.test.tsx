import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  SPONSOR_CATALOG_SCHEMA_VERSION,
  SPONSOR_RECOMMENDATION_SURFACES,
} from "~/features/AccountManagement/sponsors/constants"
import {
  SPONSOR_CATALOG_SOURCES,
  SPONSOR_SUPPORT_STATUS,
  type SponsorRecommendation,
} from "~/features/AccountManagement/sponsors/types"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { ApiCredentialProfilesSponsorRecommendationsSection } from "~/features/ApiCredentialProfiles/components/ApiCredentialProfilesSponsorRecommendationsSection"
import { render, screen } from "~~/tests/test-utils/render"

const {
  mockOpenApiCredentialProfilesPage,
  mockOpenFullAccountManagerPage,
  mockOpenFullBookmarkManagerPage,
  mockSponsorRecommendationItems,
  mockUseSponsorRecommendations,
} = vi.hoisted(() => ({
  mockOpenApiCredentialProfilesPage: vi.fn(),
  mockOpenFullAccountManagerPage: vi.fn(),
  mockOpenFullBookmarkManagerPage: vi.fn(),
  mockSponsorRecommendationItems: [] as SponsorRecommendation[],
  mockUseSponsorRecommendations: vi.fn((_options?: any) => ({
    isLoading: false,
    items: mockSponsorRecommendationItems,
  })),
}))

vi.mock(
  "~/features/AccountManagement/sponsors/useSponsorRecommendations",
  () => ({
    useSponsorRecommendations: (options: any) =>
      mockUseSponsorRecommendations(options),
  }),
)

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()

  return {
    ...actual,
    openApiCredentialProfilesPage: mockOpenApiCredentialProfilesPage,
    openFullAccountManagerPage: mockOpenFullAccountManagerPage,
    openFullBookmarkManagerPage: mockOpenFullBookmarkManagerPage,
  }
})

function setSponsorRecommendations(items: SponsorRecommendation[]) {
  mockSponsorRecommendationItems.splice(
    0,
    mockSponsorRecommendationItems.length,
  )
  mockSponsorRecommendationItems.push(...items)
}

function createSponsorWithCredentialFallback(): SponsorRecommendation {
  return {
    id: "cred-sponsor",
    name: "Credential Sponsor",
    tagline: "Great for API credentials.",
    supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
    links: {
      primary: "https://cred.example.com",
    },
    actions: {
      apiCredentialProfileFallback: {
        baseUrl: "https://api.cred.example.com/v1",
        apiKeyCreateUrl: "https://cred.example.com/keys",
        apiKeyCreateHint: "Copy your key here.",
      },
      bookmarkFallback: {
        url: "https://cred.example.com",
      },
    },
    schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
    source: SPONSOR_CATALOG_SOURCES.Bundled,
    rank: 1,
  }
}

describe("ApiCredentialProfilesSponsorRecommendationsSection", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    setSponsorRecommendations([createSponsorWithCredentialFallback()])
    mockUseSponsorRecommendations.mockReturnValue({
      isLoading: false,
      items: mockSponsorRecommendationItems,
    })
  })

  it("requests recommendations for the PopupApiCredentialProfiles surface", async () => {
    render(<ApiCredentialProfilesSponsorRecommendationsSection />, {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    expect(await screen.findByText("Credential Sponsor")).toBeInTheDocument()
    expect(mockUseSponsorRecommendations).toHaveBeenCalledWith({
      surface: SPONSOR_RECOMMENDATION_SURFACES.PopupApiCredentialProfiles,
    })
  })

  it("renders nothing when no recommendations exist", () => {
    setSponsorRecommendations([])

    const { container } = render(
      <ApiCredentialProfilesSponsorRecommendationsSection />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it("calls onOpenApiCredentialProfiles handler when provided", async () => {
    const user = userEvent.setup()
    const onOpenMock = vi.fn()

    render(
      <ApiCredentialProfilesSponsorRecommendationsSection
        onOpenApiCredentialProfiles={onOpenMock}
      />,
    )

    const actionButton = await screen.findByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.sponsorFallbackApiCredentialProfilesAction,
    )
    await user.click(actionButton)

    expect(onOpenMock).toHaveBeenCalledWith({
      name: "Credential Sponsor",
      baseUrl: "https://api.cred.example.com/v1",
      apiKeyCreateUrl: "https://cred.example.com/keys",
      apiKeyCreateHint: "Copy your key here.",
    })
    expect(mockOpenApiCredentialProfilesPage).not.toHaveBeenCalled()
  })

  it("falls back to openApiCredentialProfilesPage navigation when handler is omitted", async () => {
    const user = userEvent.setup()

    render(<ApiCredentialProfilesSponsorRecommendationsSection />)

    const actionButton = await screen.findByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.sponsorFallbackApiCredentialProfilesAction,
    )
    await user.click(actionButton)

    expect(mockOpenApiCredentialProfilesPage).toHaveBeenCalledWith({
      create: {
        name: "Credential Sponsor",
        baseUrl: "https://api.cred.example.com/v1",
        apiKeyCreateUrl: "https://cred.example.com/keys",
        apiKeyCreateHint: "Copy your key here.",
      },
    })
  })
})
