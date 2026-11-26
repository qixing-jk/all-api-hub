import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { InlineMessage } from "~/components/ui/InlineMessage"
import { NoticeActionButton } from "~/components/ui/NoticeActionButton"
import { render, screen } from "~~/tests/test-utils/render"

describe("InlineMessage", () => {
  it("scales its default icon with compact message text", () => {
    render(
      <>
        <InlineMessage size="sm">Compact message</InlineMessage>
        <InlineMessage>Regular message</InlineMessage>
      </>,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
        withReleaseUpdateStatusProvider: false,
      },
    )

    const compact = screen
      .getByText("Compact message")
      .closest('[role="status"]')
    const regular = screen
      .getByText("Regular message")
      .closest('[role="status"]')
    expect(compact).toHaveClass("text-xs")
    expect(compact?.querySelector("svg")).toHaveClass("size-3.5")
    expect(regular?.querySelector("svg")).toHaveClass("size-4")
  })

  it("keeps text-only guidance readable when its icon is intentionally omitted", () => {
    render(
      <InlineMessage icon={null} role="note">
        Read the instructions.
      </InlineMessage>,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
        withReleaseUpdateStatusProvider: false,
      },
    )
    const note = screen.getByRole("note")
    expect(note).toHaveTextContent("Read the instructions.")
    expect(note.querySelector("[aria-hidden=true]")).toBeNull()
  })
  it("announces an error assertively and leaves static notes outside live announcements", () => {
    const { rerender } = render(
      <InlineMessage role="alert" tone="destructive">
        Copy failed.
      </InlineMessage>,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
        withReleaseUpdateStatusProvider: false,
      },
    )
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive")
    rerender(
      <InlineMessage role="note">
        You can revoke permissions later.
      </InlineMessage>,
    )
    expect(screen.getByRole("note")).not.toHaveAttribute("aria-live")
  })
  it("exposes a recoverable message and keyboard action without a callout surface", async () => {
    const user = userEvent.setup()
    const retry = vi.fn()
    render(
      <InlineMessage tone="warning">
        History could not be loaded.{" "}
        <NoticeActionButton onClick={retry}>Retry</NoticeActionButton>
      </InlineMessage>,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
        withReleaseUpdateStatusProvider: false,
      },
    )
    const status = screen.getByRole("status")
    expect(status).toHaveTextContent("History could not be loaded.")
    expect(status).toHaveAttribute("aria-live", "polite")
    expect(status).toHaveClass("text-muted-foreground")
    expect(status).not.toHaveClass("border", "shadow-xs", "bg-warning-soft")
    expect(status.querySelector("[aria-hidden=true]")).toHaveClass(
      "text-warning-indicator",
    )
    await user.tab()
    expect(screen.getByRole("button", { name: "Retry" })).toHaveFocus()
    await user.keyboard("{Enter}")
    expect(retry).toHaveBeenCalledOnce()
  })
})
