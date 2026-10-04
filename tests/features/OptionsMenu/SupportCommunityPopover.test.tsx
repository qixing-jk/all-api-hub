import { fireEvent, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SupportCommunityPopover } from "~/features/OptionsMenu/SupportCommunityPopover"
import { createTab } from "~/utils/browser/browserApi"
import { render, screen } from "~~/tests/test-utils/render"

const { useSponsorRecommendationsMock } = vi.hoisted(() => ({
  useSponsorRecommendationsMock: vi.fn(),
}))

vi.mock(
  "~/features/AccountManagement/sponsors/useSponsorRecommendations",
  () => ({
    useSponsorRecommendations: () => useSponsorRecommendationsMock(),
  }),
)

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    createTab: vi.fn().mockResolvedValue(undefined),
  }
})

const renderPopover = (
  section: "sponsors" | "community",
  triggerText = "Trigger",
) =>
  render(
    <SupportCommunityPopover section={section}>
      <button type="button">{triggerText}</button>
    </SupportCommunityPopover>,
    {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    },
  )

describe("SupportCommunityPopover", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSponsorRecommendationsMock.mockReturnValue({
      items: [],
      isLoading: false,
    })
  })

  it("renders trigger and does not render popover content before click", () => {
    renderPopover("sponsors", "Open Sponsors")
    expect(
      screen.getByRole("button", { name: "Open Sponsors" }),
    ).toBeInTheDocument()
    expect(
      document.querySelector('[data-slot="popover-content"]'),
    ).not.toBeInTheDocument()
  })

  it("opens sponsors popover on click and opens sponsor link", async () => {
    useSponsorRecommendationsMock.mockReturnValue({
      isLoading: false,
      items: [
        {
          id: "demo",
          name: "Demo Sponsor",
          tagline: "Demo tagline",
          rank: 1,
          links: { primary: "https://example.com/aff" },
        },
      ],
    })

    renderPopover("sponsors", "Open Sponsors")
    fireEvent.click(screen.getByRole("button", { name: "Open Sponsors" }))

    expect(await screen.findByText("Demo Sponsor")).toBeInTheDocument()
    expect(screen.getByText("Demo tagline")).toBeInTheDocument()
    expect(screen.getByTestId("sponsor-brand-icon")).toBeInTheDocument()

    fireEvent.click(screen.getByTestId("support-popover-sponsor-demo"))
    expect(createTab).toHaveBeenCalledWith("https://example.com/aff", true)

    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="popover-content"]'),
      ).not.toBeInTheDocument()
    })
  })

  it("renders clean popover header without redundant more link and allows closing via close button", async () => {
    renderPopover("sponsors", "Open Sponsors")
    fireEvent.click(screen.getByRole("button", { name: "Open Sponsors" }))

    expect(screen.queryByTestId("support-popover-more")).not.toBeInTheDocument()

    const closeBtn = screen.getByTestId("support-popover-close")
    expect(closeBtn).toBeInTheDocument()

    fireEvent.click(closeBtn)
    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="popover-content"]'),
      ).not.toBeInTheDocument()
    })
  })

  it("lists community channels in popover and opens each link", async () => {
    renderPopover("community", "Open Community")
    fireEvent.click(screen.getByRole("button", { name: "Open Community" }))

    expect(
      await screen.findByTestId("support-popover-channel-telegram"),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByTestId("support-popover-channel-telegram"))
    expect(createTab).toHaveBeenCalledWith("https://t.me/qixing_chat", true)

    // Reopen popover for next clicks
    fireEvent.click(screen.getByRole("button", { name: "Open Community" }))
    fireEvent.click(
      await screen.findByTestId("support-popover-channel-discord"),
    )
    expect(createTab).toHaveBeenCalledWith(
      "https://discord.gg/RmFXZ577ZQ",
      true,
    )

    fireEvent.click(screen.getByRole("button", { name: "Open Community" }))
    fireEvent.click(await screen.findByTestId("support-popover-channel-qq"))
    expect(createTab).toHaveBeenCalledWith(
      "https://qm.qq.com/q/ebSCy31Phe",
      true,
    )

    // WeChat opens the image lightbox preview instead of navigating away
    fireEvent.click(screen.getByRole("button", { name: "Open Community" }))
    const wechatButton = await screen.findByTestId(
      "support-popover-channel-wechat",
    )
    fireEvent.click(wechatButton)
    expect(createTab).not.toHaveBeenCalledWith(
      expect.stringContaining("#community"),
      true,
    )
    const lightbox = await screen.findByTestId("image-lightbox-content")
    expect(lightbox).toBeInTheDocument()
    expect(screen.getByAltText("ui:feedback.wechat")).toBeInTheDocument()

    // Dismissing the lightbox
    fireEvent.click(screen.getByTestId("image-lightbox-close"))
    await waitFor(() => {
      expect(
        screen.queryByTestId("image-lightbox-content"),
      ).not.toBeInTheDocument()
    })
  })
})
