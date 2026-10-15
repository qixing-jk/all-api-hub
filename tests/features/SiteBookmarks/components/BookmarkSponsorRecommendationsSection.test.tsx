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
import { BookmarkSponsorRecommendationsSection } from "~/features/SiteBookmarks/components/BookmarkSponsorRecommendationsSection"
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

function createSponsorWithBookmarkFallback(): SponsorRecommendation {
  return {
    id: "bookmark-sponsor",
    name: "Bookmark Sponsor",
    tagline: "Great for bookmarks.",
    supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
    links: {
      primary: "https://bookmark.example.com",
    },
    actions: {
      bookmarkFallback: {
        url: "https://bookmark.example.com/start",
      },
      apiCredentialProfileFallback: {
        baseUrl: "https://api.bookmark.example.com/v1",
      },
    },
    schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
    source: SPONSOR_CATALOG_SOURCES.Bundled,
    rank: 1,
  }
}

describe("BookmarkSponsorRecommendationsSection", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    setSponsorRecommendations([createSponsorWithBookmarkFallback()])
    mockUseSponsorRecommendations.mockReturnValue({
      isLoading: false,
      items: mockSponsorRecommendationItems,
    })
  })

  it("requests recommendations for the PopupBookmarks surface", async () => {
    render(<BookmarkSponsorRecommendationsSection />, {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    expect(await screen.findByText("Bookmark Sponsor")).toBeInTheDocument()
    expect(mockUseSponsorRecommendations).toHaveBeenCalledWith({
      surface: SPONSOR_RECOMMENDATION_SURFACES.PopupBookmarks,
    })
  })

  it("renders nothing when no recommendations exist", () => {
    setSponsorRecommendations([])

    const { container } = render(<BookmarkSponsorRecommendationsSection />)

    expect(container).toBeEmptyDOMElement()
  })

  it("calls onOpenBookmarkManager handler when provided", async () => {
    const user = userEvent.setup()
    const onOpenMock = vi.fn()

    render(
      <BookmarkSponsorRecommendationsSection
        onOpenBookmarkManager={onOpenMock}
      />,
    )

    const actionButton = await screen.findByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.sponsorFallbackBookmarkAction,
    )
    await user.click(actionButton)

    expect(onOpenMock).toHaveBeenCalledWith({
      name: "Bookmark Sponsor",
      url: "https://bookmark.example.com/start",
    })
    expect(mockOpenFullBookmarkManagerPage).not.toHaveBeenCalled()
  })

  it("falls back to openFullBookmarkManagerPage navigation when handler is omitted", async () => {
    const user = userEvent.setup()

    render(<BookmarkSponsorRecommendationsSection />)

    const actionButton = await screen.findByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.sponsorFallbackBookmarkAction,
    )
    await user.click(actionButton)

    expect(mockOpenFullBookmarkManagerPage).toHaveBeenCalledWith({
      create: {
        name: "Bookmark Sponsor",
        url: "https://bookmark.example.com/start",
      },
    })
  })
})
