import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  BodyLarge,
  BodySmall,
  Caption,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Link,
  Muted,
  Typography,
} from "~/components/ui/Typography"

describe("Typography", () => {
  it.each([
    { variant: "h1", tagName: "H1" },
    { variant: "h2", tagName: "H2" },
    { variant: "h3", tagName: "H3" },
    { variant: "h4", tagName: "H4" },
    { variant: "h5", tagName: "H5" },
    { variant: "h6", tagName: "H6" },
    { variant: "code", tagName: "CODE" },
    { variant: undefined, tagName: "P" },
  ])(
    "renders the semantic default element for variant $variant",
    ({ variant, tagName }) => {
      render(
        <Typography variant={variant as any}>semantic typography</Typography>,
      )

      expect(screen.getByText("semantic typography").tagName).toBe(tagName)
    },
  )

  it("honors explicit element overrides and merges variant, alignment, weight, size, and custom classes", () => {
    render(
      <Typography
        as="span"
        variant="h1"
        align="center"
        weight="bold"
        size="xl"
        className="custom-class"
      >
        override
      </Typography>,
    )

    const element = screen.getByText("override")
    expect(element.tagName).toBe("SPAN")
    expect(element).toHaveClass(
      "text-foreground",
      "text-center",
      "font-bold",
      "text-xl",
      "custom-class",
    )
  })

  it("renders the convenience typography exports with their intended elements and props", () => {
    render(
      <>
        <Heading1>Heading 1</Heading1>
        <Heading2>Heading 2</Heading2>
        <Heading3>Heading 3</Heading3>
        <Heading4>Heading 4</Heading4>
        <Heading5>Heading 5</Heading5>
        <Heading6>Heading 6</Heading6>
        <BodyLarge>Body Large</BodyLarge>
        <BodySmall>Body Small</BodySmall>
        <Caption>Caption</Caption>
        <Muted>Muted</Muted>
        <Link href="https://example.com/docs">Docs</Link>
        <Code>const value = 1</Code>
      </>,
    )

    expect(screen.getByText("Heading 1").tagName).toBe("H1")
    expect(screen.getByText("Heading 2").tagName).toBe("H2")
    expect(screen.getByText("Heading 3").tagName).toBe("H3")
    expect(screen.getByText("Heading 4").tagName).toBe("H4")
    expect(screen.getByText("Heading 5").tagName).toBe("H5")
    expect(screen.getByText("Heading 6").tagName).toBe("H6")
    expect(screen.getByText("Body Large").tagName).toBe("P")
    expect(screen.getByText("Body Small").tagName).toBe("P")
    expect(screen.getByText("Caption").tagName).toBe("SPAN")
    expect(screen.getByText("Muted").tagName).toBe("SPAN")
    expect(screen.getByText("Docs")).toHaveAttribute(
      "href",
      "https://example.com/docs",
    )
    expect(screen.getByText("const value = 1").tagName).toBe("CODE")
  })
})
