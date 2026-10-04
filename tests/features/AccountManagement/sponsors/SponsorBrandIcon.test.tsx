import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  DEFAULT_SPONSOR_ICON,
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

  it("resolves all 9 bundled sponsor icons properly", () => {
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
    ]

    for (const id of sponsorIds) {
      const { unmount } = render(<SponsorBrandIcon sponsorId={id} name={id} />)
      const img = screen.getByTestId("sponsor-brand-image")
      expect(img).toBeInTheDocument()
      expect(img.getAttribute("src")).toBeTruthy()
      unmount()
    }
  })

  it("falls back to local default icon when sponsorId is unknown", () => {
    render(
      <SponsorBrandIcon
        sponsorId="unknown-sponsor"
        name="Custom AI"
        websiteUrl="https://custom.ai/page"
      />,
    )

    const img = screen.getByTestId("sponsor-brand-image")
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute("src", DEFAULT_SPONSOR_ICON)
  })

  it("falls back to local default icon when sponsorId is omitted", () => {
    render(<SponsorBrandIcon name="星辰AI" />)

    const img = screen.getByTestId("sponsor-brand-image")
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute("src", DEFAULT_SPONSOR_ICON)
  })

  it("falls back to default icon when primary image fails to load", () => {
    render(<SponsorBrandIcon sponsorId="qiniu-cloud-ai" name="七牛云AI" />)

    const img = screen.getByTestId("sponsor-brand-image")
    expect(img.getAttribute("src")).toContain("qiniu-cloud-ai")

    fireEvent.error(img)

    expect(img).toHaveAttribute("src", DEFAULT_SPONSOR_ICON)
  })

  it("applies different size classes", () => {
    const { container, rerender } = render(
      <SponsorBrandIcon name="Test" size="xs" />,
    )
    expect(container.firstChild).toHaveClass("h-5")

    rerender(<SponsorBrandIcon name="Test" size="sm" />)
    expect(container.firstChild).toHaveClass("h-6")

    rerender(<SponsorBrandIcon name="Test" size="md" />)
    expect(container.firstChild).toHaveClass("h-8")

    rerender(<SponsorBrandIcon name="Test" size="lg" />)
    expect(container.firstChild).toHaveClass("h-10")

    rerender(<SponsorBrandIcon name="Test" size="xl" />)
    expect(container.firstChild).toHaveClass("h-12")
  })
})
