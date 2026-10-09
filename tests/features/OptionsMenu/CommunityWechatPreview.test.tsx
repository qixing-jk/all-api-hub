import { act, fireEvent } from "@testing-library/react"
import type { ComponentProps } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { readCommunityResourceCache } from "~/features/OptionsMenu/communityResourceCache"
import type { CommunityQrCode } from "~/features/OptionsMenu/communityResources"
import { CommunityWechatPreview } from "~/features/OptionsMenu/CommunityWechatPreview"
import { useCommunityWechatImage } from "~/features/OptionsMenu/useCommunityWechatImage"
import {
  communityImageResponse,
  mockCommunityImageBrowserApis,
  mockCommunityResourceCache,
} from "~~/tests/test-utils/communityResourceCache"
import { render, screen } from "~~/tests/test-utils/render"

/** Exercises the real request owner together with the preview's expiry and recovery UI. */
function PreviewWithImage({
  qrCode,
  ...props
}: Omit<ComponentProps<typeof CommunityWechatPreview>, "image"> & {
  qrCode: CommunityQrCode
}) {
  const image = useCommunityWechatImage(qrCode)
  return <CommunityWechatPreview image={image} {...props} />
}

describe("CommunityWechatPreview", () => {
  beforeEach(() => {
    mockCommunityResourceCache()
    mockCommunityImageBrowserApis()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => communityImageResponse()),
    )
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("shows help only at group expiry while keeping both QR codes visible", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-14T00:00:00Z"))
    const qrCode = {
      url: "https://example.com/qr.png",
      expiresAt: "2026-10-14T00:00:01Z",
    }
    render(
      <PreviewWithImage
        qrCode={qrCode}
        onClose={vi.fn()}
        onOpenCommunityPage={vi.fn()}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(screen.getByRole("img")).toBeInTheDocument()
    expect(screen.queryByText("ui:feedback.wechatHelp")).not.toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    expect(screen.getByRole("img")).toBeVisible()
    expect(screen.getByText("ui:feedback.wechatHelp")).toBeVisible()
  })

  it.each([undefined, "2026-10-13T00:00:00Z"])(
    "shows help for an unknown or already elapsed expiry: %s",
    async (expiresAt) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date("2026-10-14T00:00:00Z"))
      render(
        <PreviewWithImage
          qrCode={{ url: "https://example.com/qr.png", expiresAt }}
          onClose={vi.fn()}
          onOpenCommunityPage={vi.fn()}
        />,
        { withUserPreferencesProvider: false, withThemeProvider: false },
      )
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(screen.getByText("ui:feedback.wechatHelp")).toBeVisible()
      expect(screen.getByRole("img")).toBeVisible()
    },
  )

  it("uses the cached image's own expiry when a replacement image fails to load", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-14T00:00:00Z"))
    const renderPreview = (expiresAt: string) =>
      render(
        <PreviewWithImage
          qrCode={{ url: "https://example.com/qr.png", expiresAt }}
          onClose={vi.fn()}
          onOpenCommunityPage={vi.fn()}
        />,
        { withUserPreferencesProvider: false, withThemeProvider: false },
      )
    const first = renderPreview("2026-10-15T00:00:00Z")
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(screen.queryByText("ui:feedback.wechatHelp")).not.toBeInTheDocument()
    first.unmount()
    vi.mocked(fetch).mockRejectedValue(new Error("offline"))
    const second = renderPreview("2026-10-13T00:00:00Z")
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(screen.getByRole("img")).toBeVisible()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(screen.queryByText("ui:feedback.wechatHelp")).not.toBeInTheDocument()
    second.unmount()
    vi.setSystemTime(new Date("2026-10-16T00:00:00Z"))
    renderPreview("2026-10-20T00:00:00Z")
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(screen.getByText("ui:feedback.wechatHelp")).toBeVisible()
    expect(screen.getByRole("img")).toBeVisible()
  })

  it("keeps online recovery available even when an image loads but scanning cannot join the group", async () => {
    const onOpenCommunityPage = vi.fn()
    render(
      <PreviewWithImage
        qrCode={{ url: "https://example.com/contact.png" }}
        onClose={vi.fn()}
        onOpenCommunityPage={onOpenCommunityPage}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    fireEvent.load(await screen.findByRole("img"))
    fireEvent.click(
      screen.getByRole("button", { name: "ui:feedback.openCommunityPage" }),
    )
    expect(onOpenCommunityPage).toHaveBeenCalledOnce()
  })

  it("releases the preview URL on close and uses the persisted bytes when reopened offline", async () => {
    const { createObjectURL, revokeObjectURL } = mockCommunityImageBrowserApis()
    const renderPreview = () =>
      render(
        <PreviewWithImage
          qrCode={{ url: "https://example.com/qr.png" }}
          onClose={vi.fn()}
          onOpenCommunityPage={vi.fn()}
        />,
        { withUserPreferencesProvider: false, withThemeProvider: false },
      )
    const first = renderPreview()
    expect(await screen.findByRole("img")).toHaveAttribute(
      "src",
      "blob:community-wechat",
    )
    const saved = await readCommunityResourceCache("image")
    expect(saved).toBeDefined()
    const savedBlob = await saved!.blob()
    expect(savedBlob.type).toBe("image/png")
    expect(await savedBlob.text()).toBe("qr-image-bytes")
    first.unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:community-wechat")
    vi.mocked(fetch).mockRejectedValue(new Error("offline"))
    renderPreview()
    expect(await screen.findByRole("img")).toHaveAttribute(
      "src",
      "blob:community-wechat",
    )
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(createObjectURL).toHaveBeenCalledTimes(2)
  })
})
