import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  SPONSOR_CATALOG_SCHEMA_VERSION,
  SPONSOR_RECOMMENDATION_SURFACES,
  SPONSOR_WORKFLOW_KINDS,
} from "~/features/AccountManagement/sponsors/constants"
import { PopupSponsorRecommendationsSection } from "~/features/AccountManagement/sponsors/PopupSponsorRecommendationsSection"
import {
  SPONSOR_CATALOG_SOURCES,
  SPONSOR_SUPPORT_STATUS,
  type SponsorRecommendation,
} from "~/features/AccountManagement/sponsors/types"
import type { useSponsorRecommendations } from "~/features/AccountManagement/sponsors/useSponsorRecommendations"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { openFullAccountManagerPage } from "~/utils/navigation"
import { act, render, screen } from "~~/tests/test-utils/render"
import { consumeSponsorWorkflow } from "~~/tests/test-utils/sponsorWorkflow"

type SponsorRecommendationOptions = Parameters<
  typeof useSponsorRecommendations
>[0]

const popupRuntime = vi.hoisted(() => ({ inPopup: false }))
vi.mock("~/utils/browser", async (original) => ({
  ...(await original<typeof import("~/utils/browser")>()),
  isExtensionPopup: () => popupRuntime.inPopup,
}))

vi.mock("~/utils/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/navigation")>()),
  openFullAccountManagerPage: vi.fn(),
}))

const { mockSponsorRecommendationItems, mockUseSponsorRecommendations } =
  vi.hoisted(() => ({
    mockSponsorRecommendationItems: [] as SponsorRecommendation[],
    mockUseSponsorRecommendations: vi.fn(
      (_options?: SponsorRecommendationOptions) => ({
        isLoading: false,
        items: mockSponsorRecommendationItems,
      }),
    ),
  }))

vi.mock(
  "~/features/AccountManagement/sponsors/useSponsorRecommendations",
  () => ({
    useSponsorRecommendations: (options: SponsorRecommendationOptions) =>
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
    popupRuntime.inPopup = false
    vi.spyOn(window, "open").mockReturnValue(null)
    vi.spyOn(window, "close").mockImplementation(() => {})
    setSponsorRecommendations([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("moves popup sponsor creation to the sidebar before visiting, bypassing the transient local handler", async () => {
    popupRuntime.inPopup = true
    const open = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("chrome", { sidePanel: { open } })
    vi.spyOn(browser.tabs, "query").mockResolvedValue([
      { id: 3, windowId: 2 },
    ] as browser.tabs.Tab[])
    const localHandler = vi.fn()
    setSponsorRecommendations([createSponsorRecommendation()])
    render(
      <PopupSponsorRecommendationsSection
        surface={SPONSOR_RECOMMENDATION_SURFACES.Newcomer}
        onContinueAddAccount={localHandler}
      />,
    )
    await userEvent
      .setup()
      .click(
        await screen.findByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.sponsorContinueAddAccountAction,
        ),
      )
    expect(open).toHaveBeenCalledWith({ windowId: 2 })
    expect(localHandler).not.toHaveBeenCalled()
    expect(await consumeSponsorWorkflow(2)).toEqual({
      kind: SPONSOR_WORKFLOW_KINDS.Account,
      prefill: expect.objectContaining({
        sponsorId: "sponsor-1",
        source: "sponsor",
      }),
    })
    expect(
      await browser.tabs.query({ url: "https://example.com/sponsor" }),
    ).toHaveLength(1)
    expect(window.open).not.toHaveBeenCalled()
  })

  it("returns null when no recommendations are present", async () => {
    const { container } = await act(async () =>
      render(
        <PopupSponsorRecommendationsSection
          surface={SPONSOR_RECOMMENDATION_SURFACES.Newcomer}
        />,
      ),
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

  it("opens account management when a supported recommendation has no local dialog", async () => {
    const user = userEvent.setup()
    setSponsorRecommendations([createSponsorRecommendation()])
    render(
      <PopupSponsorRecommendationsSection
        surface={SPONSOR_RECOMMENDATION_SURFACES.Newcomer}
      />,
    )

    await user.click(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.sponsorContinueAddAccountAction,
      ),
    )
    expect(openFullAccountManagerPage).toHaveBeenCalledOnce()
  })

  it("uses the supplied account handler with the sponsor prefill", async () => {
    const user = userEvent.setup()
    const onContinueAddAccount = vi.fn()
    setSponsorRecommendations([createSponsorRecommendation()])
    render(
      <PopupSponsorRecommendationsSection
        surface={SPONSOR_RECOMMENDATION_SURFACES.Newcomer}
        onContinueAddAccount={onContinueAddAccount}
      />,
    )

    await user.click(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.sponsorContinueAddAccountAction,
      ),
    )
    expect(onContinueAddAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        siteUrl: "https://example.com/sponsor",
        source: "sponsor",
        sponsorId: "sponsor-1",
      }),
    )
    expect(openFullAccountManagerPage).not.toHaveBeenCalled()
  })
})
