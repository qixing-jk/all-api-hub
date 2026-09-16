import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { MarkdownContent } from "~/components/MarkdownContent"

describe("MarkdownContent", () => {
  it("keeps semantic content while removing authored typography and unsafe markup", () => {
    const { container } = render(
      <MarkdownContent
        content={`# Heading

- Item

<p id="override" class="text-xs" style="font: 10px Arial; line-height: 10px; --font-size-sm: 8px">Inline text</p>
<font size="1" face="Arial" color="red">Legacy text</font>
<a href="javascript:alert(1)">Unsafe link</a>
<script>alert(1)</script>
<style>p { font-size: 8px }</style>
`}
      />,
    )
    expect(screen.getByRole("heading", { name: "Heading" })).toBeVisible()
    expect(screen.getByRole("listitem")).toHaveTextContent("Item")
    expect(screen.getByText("Inline text")).not.toHaveAttribute("style")
    expect(screen.getByText("Inline text")).not.toHaveAttribute("class")
    expect(screen.getByText("Inline text")).not.toHaveAttribute("id")
    expect(container).toHaveTextContent("Legacy text")
    expect(container.querySelector("font, script, style")).toBeNull()
    expect(screen.getByText("Unsafe link")).not.toHaveAttribute("href")
  })
})
