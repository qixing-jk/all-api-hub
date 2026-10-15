import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  SPONSOR_CATALOG_SCHEMA_VERSION,
  SPONSOR_RECOMMENDATION_SURFACES,
} from "~/features/AccountManagement/sponsors/constants"
import { PopupSponsorRecommendationsSection } from "~/features/AccountManagement/sponsors/PopupSponsorRecommendationsSection"
import {
  SPONSOR_CATALOG_SOURCES,
  SPONSOR_SUPPORT_STATUS,
  type SponsorRecommendation,
} from "~/features/AccountManagement/sponsors/types"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { render, screen } from "~~/tests/test-utils/render"

const { mockSponsorRecommendationItems, mockUseSponsorRecommendations } =
  vi.hoisted(() => ({
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

function setSponsorRecommendations(items: SponsorRecommendation[]) {
  mockSponsorRecommendationItems.splice(
    0,
    mockSponsorRecommendationItems.length,
  )
  mockSponsorRecommendationItems.push(...items)
}

function createSponsorRecommendation(): SponsorRecommendation {
  return {
    id: "sponsor-1",
    name: "Test Sponsor",
    tagline: "A great sponsor",
    supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
    links: {
      primary: "https://example.com/sponsor",
    },
    actions: {
      addAccount: {
        siteType: "new-api",
        siteUrl: "https://example.com/sponsor",
      },
    },
    schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
    source: SPONSOR_CATALOG_SOURCES.Bundled,
    rank: 1,
  }
}

describe("PopupSponsorRecommendationsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setSponsorRecommendations([])
  })

  it("returns null when no recommendations are present", () => {
    const { container } = render(
      <PopupSponsorRecommendationsSection
        surface={SPONSOR_RECOMMENDATION_SURFACES.Newcomer}
      />,
    )

    expect(container.firstChild).toBeNull()
  })

  it("renders recommendations with default border and spacing wrapper when recommendations exist", async () => {
    setSponsorRecommendations([createSponsorRecommendation()])

    const { container } = render(
      <PopupSponsorRecommendationsSection
        surface={SPONSOR_RECOMMENDATION_SURFACES.Newcomer}
      />,
    )

    const section = await screen.findByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.sponsorRecommendations,
    )
    expect(section).toBeInTheDocument()

    const wrapper = container.firstChild as HTMLElement
    expect(wrapper).toHaveClass(
      "border-border",
      "mt-density-3",
      "pt-density-3",
      "border-t",
    )
  })

  it("accepts custom className to override spacing", async () => {
    setSponsorRecommendations([createSponsorRecommendation()])

    const { container } = render(
      <PopupSponsorRecommendationsSection
        surface={SPONSOR_RECOMMENDATION_SURFACES.Newcomer}
        className="mt-density-5 pt-density-4"
      />,
    )

    await screen.findByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.sponsorRecommendations,
    )

    const wrapper = container.firstChild as HTMLElement
    expect(wrapper).toHaveClass("mt-density-5", "pt-density-4")
  })
})
