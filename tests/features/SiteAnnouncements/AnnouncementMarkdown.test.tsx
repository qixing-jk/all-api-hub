import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AnnouncementMarkdown } from "~/features/SiteAnnouncements/AnnouncementMarkdown"
import { render } from "~~/tests/test-utils/render"

describe("AnnouncementMarkdown", () => {
  it("renders Markdown links so they open in a new tab", async () => {
    render(
      <AnnouncementMarkdown content="[Read details](https://example.com/news)" />,
    )

    const link = await screen.findByRole("link", { name: "Read details" })

    expect(link).toHaveAttribute("href", "https://example.com/news")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
  })

  it("forces sanitized HTML links to open in a new tab", async () => {
    render(
      <AnnouncementMarkdown content='<a href="https://example.com" target="_self" rel="opener">Portal</a>' />,
    )

    const link = await screen.findByRole("link", { name: "Portal" })

    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
  })
})
