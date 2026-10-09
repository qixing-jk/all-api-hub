import { act, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SupportCommunityPopover } from "~/features/OptionsMenu/SupportCommunityPopover"
import { createTab } from "~/utils/browser/tabs"
import { getDocsCommunityUrl } from "~/utils/navigation/docsLinks"
import {
  communityImageResponse,
  mockCommunityImageBrowserApis,
  mockCommunityResourceCache,
} from "~~/tests/test-utils/communityResourceCache"
import { render, screen } from "~~/tests/test-utils/render"

const { useSponsorRecommendationsMock } = vi.hoisted(() => ({
  useSponsorRecommendationsMock: vi.fn(),
}))

const catalog = {
  schemaVersion: 1,
  channels: [
    { id: "telegram", url: "https://t.me/qixing_chat" },
    { id: "discord", url: "https://discord.gg/RmFXZ577ZQ" },
    { id: "qq", url: "https://qm.qq.com/q/ebSCy31Phe" },
    {
      id: "wechat",
      qrCode: {
        url: "https://example.com/current-wechat.png",
      },
    },
  ],
}
const fetchMock = vi.fn()

vi.mock(
  "~/features/AccountManagement/sponsors/useSponsorRecommendations",
  () => ({
    useSponsorRecommendations: () => useSponsorRecommendationsMock(),
  }),
)

vi.mock("~/utils/browser/tabs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browser/tabs")>()
  return { ...actual, createTab: vi.fn().mockResolvedValue(undefined) }
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
    mockCommunityResourceCache()
    mockCommunityImageBrowserApis()
    // Each request needs its own response body, including after reopening.
    fetchMock.mockImplementation(async (url: string) =>
      url.includes(".png")
        ? communityImageResponse()
        : new Response(JSON.stringify(catalog)),
    )
    vi.stubGlobal("fetch", fetchMock)
    useSponsorRecommendationsMock.mockReturnValue({
      items: [],
      isLoading: false,
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it("renders trigger and does not render popover content before click", () => {
    renderPopover("sponsors", "Open Sponsors")
    expect(
      screen.getByRole("button", { name: "Open Sponsors" }),
    ).toBeInTheDocument()
    expect(
      document.querySelector('[data-slot="popover-content"]'),
    ).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
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
    expect(
      await screen.findByRole("img", { name: "ui:feedback.wechat" }),
    ).toHaveAttribute("src", "blob:community-wechat")

    // Dismissing the lightbox
    fireEvent.click(screen.getByTestId("image-lightbox-close"))
    await waitFor(() => {
      expect(
        screen.queryByTestId("image-lightbox-content"),
      ).not.toBeInTheDocument()
    })
  })

  it("starts the QR download on community open and shares it with the preview", async () => {
    const user = userEvent.setup()
    let finishImage!: (response: Response) => void
    let imageSignal: AbortSignal | undefined
    const imageRequests = vi.fn((_url, options) => {
      imageSignal = options.signal
      return new Promise<Response>((resolve) => {
        finishImage = resolve
      })
    })
    fetchMock.mockImplementation((url: string, options) =>
      url.includes(".png")
        ? imageRequests(url, options)
        : Promise.resolve(new Response(JSON.stringify(catalog))),
    )
    renderPopover("community", "Open Community")
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(imageRequests).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Open Community" }))
    await waitFor(() => expect(imageRequests).toHaveBeenCalledOnce())
    expect(
      screen.queryByTestId("image-lightbox-content"),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "ui:feedback.wechat" }))
    expect(imageRequests).toHaveBeenCalledOnce()
    expect(imageSignal?.aborted).toBe(false)
    await act(async () => finishImage(communityImageResponse()))
    expect(
      await screen.findByRole("img", { name: "ui:feedback.wechat" }),
    ).toHaveAttribute("src", "blob:community-wechat")
    expect(imageRequests).toHaveBeenCalledOnce()
    await user.click(
      screen.getByRole("button", { name: "common:actions.close" }),
    )
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:community-wechat")
  })

  it("shows the completed QR preload without another download when WeChat is selected", async () => {
    const user = userEvent.setup()
    renderPopover("community", "Open Community")
    await user.click(screen.getByRole("button", { name: "Open Community" }))
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledOnce())
    const requestsBeforePreview = fetchMock.mock.calls.length
    await user.click(screen.getByRole("button", { name: "ui:feedback.wechat" }))
    expect(
      screen.getByRole("img", { name: "ui:feedback.wechat" }),
    ).toHaveAttribute("src", "blob:community-wechat")
    expect(fetchMock.mock.calls).toHaveLength(requestsBeforePreview)
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
  })

  it("cancels a speculative QR download when the community menu closes without opening the preview", async () => {
    const user = userEvent.setup()
    let imageSignal: AbortSignal | undefined
    fetchMock.mockImplementation((url: string, options) => {
      if (!url.includes(".png"))
        return Promise.resolve(new Response(JSON.stringify(catalog)))
      imageSignal = options.signal
      return new Promise<Response>(() => {})
    })
    renderPopover("community", "Open Community")
    await user.click(screen.getByRole("button", { name: "Open Community" }))
    await waitFor(() => expect(imageSignal).toBeDefined())
    await user.click(
      screen.getByRole("button", { name: "common:actions.close" }),
    )
    expect(imageSignal?.aborted).toBe(true)
  })

  it("preloads the directory before opening and refreshes remote destinations on reopen", async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            channels: [{ id: "telegram", url: "https://t.me/updated_group" }],
          }),
        ),
    )
    renderPopover("community", "Open Community")
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(
      screen.queryByRole("button", { name: "Telegram" }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Open Community" }))
    await user.click(await screen.findByRole("button", { name: "Telegram" }))
    expect(createTab).toHaveBeenLastCalledWith(
      "https://t.me/updated_group",
      true,
    )
    expect(fetchMock).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/qixing-jk/all-api-hub/main/public/community-resources.v1.json",
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    )

    fetchMock.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            channels: [{ id: "qq", url: "https://qm.qq.com/q/new" }],
          }),
        ),
    )
    await user.click(screen.getByRole("button", { name: "Open Community" }))
    await user.click(await screen.findByRole("button", { name: "QQ" }))
    expect(createTab).toHaveBeenLastCalledWith("https://qm.qq.com/q/new", true)
    expect(
      screen.queryByRole("button", { name: "Telegram" }),
    ).not.toBeInTheDocument()
  })

  it("keeps cached invitations and the online community page available after a failed refresh", async () => {
    const user = userEvent.setup()
    renderPopover("community", "Open Community")
    await user.click(screen.getByRole("button", { name: "Open Community" }))
    await user.click(await screen.findByRole("button", { name: "Telegram" }))

    fetchMock.mockRejectedValueOnce(new Error("offline"))
    await user.click(screen.getByRole("button", { name: "Open Community" }))
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    )
    expect(screen.queryByRole("button", { name: "Telegram" })).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "ui:feedback.openCommunityPage" }),
    )
    expect(createTab).toHaveBeenLastCalledWith(getDocsCommunityUrl("en"), true)
  })

  it("shows the remote image even when older metadata says the group invitation expired", async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            channels: [
              {
                id: "wechat",
                qrCode: {
                  url: "https://example.com/expired.png",
                  expiresAt: "2000-01-01T00:00:00Z",
                },
              },
            ],
          }),
        ),
    )
    renderPopover("community", "Open Community")
    await user.click(screen.getByRole("button", { name: "Open Community" }))
    await user.click(
      await screen.findByRole("button", { name: "ui:feedback.wechat" }),
    )
    expect(
      await screen.findByRole("img", { name: "ui:feedback.wechat" }),
    ).toHaveAttribute("src", "blob:community-wechat")
    await user.click(
      screen.getByRole("button", { name: "ui:feedback.openCommunityPage" }),
    )
    expect(createTab).toHaveBeenLastCalledWith(getDocsCommunityUrl("en"), true)
  })

  it("replaces a broken QR image with recovery guidance", async () => {
    const user = userEvent.setup()
    renderPopover("community", "Open Community")
    await user.click(screen.getByRole("button", { name: "Open Community" }))
    await user.click(
      await screen.findByRole("button", { name: "ui:feedback.wechat" }),
    )
    fireEvent.error(
      await screen.findByRole("img", { name: "ui:feedback.wechat" }),
    )
    expect(
      await screen.findByText("ui:feedback.wechatUnavailable"),
    ).toBeVisible()
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: "ui:feedback.openCommunityPage" }),
    )
    expect(createTab).toHaveBeenLastCalledWith(getDocsCommunityUrl("en"), true)
  })

  it("provides bundled invitations on the first offline open", async () => {
    const user = userEvent.setup()
    fetchMock.mockRejectedValue(new Error("offline"))
    renderPopover("community", "Open Community")
    await user.click(screen.getByRole("button", { name: "Open Community" }))
    const telegram = await screen.findByRole("button", { name: "Telegram" })
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    await user.click(telegram)
    expect(createTab).toHaveBeenLastCalledWith("https://t.me/qixing_chat", true)
  })
})
