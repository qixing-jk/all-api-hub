import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AnnouncementMarkdown } from "~/features/SiteAnnouncements/AnnouncementMarkdown"

describe("AnnouncementMarkdown", () => {
  it("renders Markdown links so they open in a new tab", () => {
    render(
      <AnnouncementMarkdown content="[Read details](https://example.com/news)" />,
    )

    const link = screen.getByRole("link", { name: "Read details" })

    expect(link).toHaveAttribute("href", "https://example.com/news")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
  })

  it("forces sanitized HTML links to open in a new tab", () => {
    render(
      <AnnouncementMarkdown content='<a href="https://example.com" target="_self" rel="opener">Portal</a>' />,
    )

    const link = screen.getByRole("link", { name: "Portal" })

    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
  })
})
