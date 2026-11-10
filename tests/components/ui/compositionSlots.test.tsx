import { describe, expect, it } from "vitest"

import { Alert, AlertAction } from "~/components/ui/Alert"
import { Card, CardAction, CardHeader, CardTitle } from "~/components/ui/Card"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
} from "~/components/ui/popover"
import { render, screen } from "~~/tests/test-utils/render"

describe("composable heading and action slots", () => {
  it("preserves a card's heading and makes its action available", async () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Repair results</CardTitle>
          <CardAction>
            <button>Search keys</button>
          </CardAction>
        </CardHeader>
      </Card>,
    )
    expect(
      await screen.findByRole("heading", { name: "Repair results", level: 3 }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Search keys" }),
    ).toBeInTheDocument()
  })
  it("keeps an alert's text and action together", async () => {
    render(
      <Alert
        description="Read the guide"
        action={
          <AlertAction>
            <button>Get started</button>
          </AlertAction>
        }
      />,
    )
    expect(
      await screen.findByRole("button", { name: "Get started" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("Read the guide")
  })
  it("supports explicit names and descriptions for a popover", async () => {
    render(
      <Popover defaultOpen>
        <PopoverContent aria-labelledby="title" aria-describedby="description">
          <PopoverHeader>
            <PopoverTitle id="title">Community</PopoverTitle>
            <PopoverDescription id="description">
              Choose a channel
            </PopoverDescription>
          </PopoverHeader>
        </PopoverContent>
      </Popover>,
    )
    const panel = await screen.findByRole("dialog", { name: "Community" })
    expect(panel).toHaveAccessibleDescription("Choose a channel")
    expect(
      screen.getByRole("heading", { name: "Community" }),
    ).toBeInTheDocument()
  })
})
