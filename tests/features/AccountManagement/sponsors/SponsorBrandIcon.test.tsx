import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SPONSOR_REMOTE_ICON_BASE_URL } from "~/features/AccountManagement/sponsors/constants"
import {
  DEFAULT_SPONSOR_ICON,
  SPONSOR_BRAND_ICON_SIZES,
  SponsorBrandIcon,
} from "~/features/AccountManagement/sponsors/SponsorBrandIcon"

describe("SponsorBrandIcon component", () => {
  it("renders local brand icon for known sponsorId", () => {
    render(<SponsorBrandIcon sponsorId="qiniu-cloud-ai" name="七牛云AI" />)

    const img = screen.getByTestId("sponsor-brand-image")
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute("src")
    expect(img.getAttribute("src")).toContain("qiniu-cloud-ai")
  })

  it("resolves all bundled sponsor icons properly", () => {
    const sponsorIds = [
      "qiniu-cloud-ai",
      "fenno-ai",
      "packycode",
      "xingchen-ai",
      "xuanshu-api",
      "aicodemirror",
      "suixiang",
      "volcengine-coding-plan",
      "apimart",
      "88api",
    ]

    for (const id of sponsorIds) {
      const { unmount } = render(<SponsorBrandIcon sponsorId={id} name={id} />)
      const img = screen.getByTestId("sponsor-brand-image")
      expect(img).toBeInTheDocument()
      expect(img.getAttribute("src")).toBeTruthy()
      unmount()
    }
  })

  it("prioritizes explicit iconUrl when provided", () => {
    render(
      <SponsorBrandIcon
        sponsorId="qiniu-cloud-ai"
        name="七牛云AI"
        iconUrl="https://cdn.example.com/custom-qiniu.png"
      />,
    )

    const img = screen.getByTestId("sponsor-brand-image")
    expect(img).toHaveAttribute(
      "src",
      "https://cdn.example.com/custom-qiniu.png",
    )
  })

  it("falls back from failing explicit iconUrl to local bundled icon", () => {
    render(
      <SponsorBrandIcon
        sponsorId="qiniu-cloud-ai"
        name="七牛云AI"
        iconUrl="https://cdn.example.com/broken-custom.png"
      />,
    )

    const img = screen.getByTestId("sponsor-brand-image")
    expect(img).toHaveAttribute(
      "src",
      "https://cdn.example.com/broken-custom.png",
    )

    fireEvent.error(img)

    expect(img.getAttribute("src")).toContain("qiniu-cloud-ai")
  })

  it("attempts remote convention URLs (.png then .jpg) for unbundled sponsorId before default fallback", () => {
    render(<SponsorBrandIcon sponsorId="unbundled-new-sponsor" name="New AI" />)

    const img = screen.getByTestId("sponsor-brand-image")
    expect(img).toHaveAttribute(
      "src",
      `${SPONSOR_REMOTE_ICON_BASE_URL}/unbundled-new-sponsor.png`,
    )

    // Simulate .png 404 error -> falls back to .jpg
    fireEvent.error(img)
    expect(img).toHaveAttribute(
      "src",
      `${SPONSOR_REMOTE_ICON_BASE_URL}/unbundled-new-sponsor.jpg`,
    )

    // Simulate .jpg 404 error -> falls back to default icon
    fireEvent.error(img)
    expect(img).toHaveAttribute("src", DEFAULT_SPONSOR_ICON)

    // Further errors when already at default fallback keep the default icon
    fireEvent.error(img)
    expect(img).toHaveAttribute("src", DEFAULT_SPONSOR_ICON)
  })

  it("falls back to local default icon when sponsorId is omitted", () => {
    render(<SponsorBrandIcon name="星辰AI" />)

    const img = screen.getByTestId("sponsor-brand-image")
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute("src", DEFAULT_SPONSOR_ICON)
  })

  it("falls back to default icon when primary local image fails to load", () => {
    render(<SponsorBrandIcon sponsorId="qiniu-cloud-ai" name="七牛云AI" />)

    const img = screen.getByTestId("sponsor-brand-image")
    expect(img.getAttribute("src")).toContain("qiniu-cloud-ai")

    fireEvent.error(img)

    expect(img).toHaveAttribute("src", DEFAULT_SPONSOR_ICON)
  })

  it("resets candidate fallback index when sponsorId or iconUrl prop changes", () => {
    const { rerender } = render(
      <SponsorBrandIcon
        sponsorId="qiniu-cloud-ai"
        name="七牛云AI"
        iconUrl="https://cdn.example.com/broken-custom.png"
      />,
    )

    const img = screen.getByTestId("sponsor-brand-image")
    expect(img).toHaveAttribute(
      "src",
      "https://cdn.example.com/broken-custom.png",
    )

    fireEvent.error(img)
    expect(img.getAttribute("src")).toContain("qiniu-cloud-ai")

    rerender(
      <SponsorBrandIcon
        sponsorId="packycode"
        name="PackyCode"
        iconUrl="https://cdn.example.com/packy-custom.png"
      />,
    )

    expect(img).toHaveAttribute(
      "src",
      "https://cdn.example.com/packy-custom.png",
    )
  })

  it("applies different size classes", () => {
    const { container, rerender } = render(
      <SponsorBrandIcon name="Test" size={SPONSOR_BRAND_ICON_SIZES.Xs} />,
    )
    expect(container.firstChild).toHaveClass("h-5")

    rerender(
      <SponsorBrandIcon name="Test" size={SPONSOR_BRAND_ICON_SIZES.Sm} />,
    )
    expect(container.firstChild).toHaveClass("h-6")

    rerender(
      <SponsorBrandIcon name="Test" size={SPONSOR_BRAND_ICON_SIZES.Md} />,
    )
    expect(container.firstChild).toHaveClass("h-8")

    rerender(
      <SponsorBrandIcon name="Test" size={SPONSOR_BRAND_ICON_SIZES.Lg} />,
    )
    expect(container.firstChild).toHaveClass("h-10")

    rerender(
      <SponsorBrandIcon name="Test" size={SPONSOR_BRAND_ICON_SIZES.Xl} />,
    )
    expect(container.firstChild).toHaveClass("h-12")
  })
})
