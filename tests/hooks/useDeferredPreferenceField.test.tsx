import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { KeyboardEvent } from "react"
import { describe, expect, it, vi } from "vitest"

import {
  useDeferredPreferenceField,
  type DeferredPreferenceCommitResult,
} from "~/hooks/useDeferredPreferenceField"

type HarnessProps = {
  savedValue: string
  savedVersion: number
  onCommit: (draft: string) => Promise<DeferredPreferenceCommitResult>
  onImmediateAction?: () => void
}

function DeferredFieldHarness({
  savedValue,
  savedVersion,
  onCommit,
  onImmediateAction,
}: HarnessProps) {
  const field = useDeferredPreferenceField({
    savedValue,
    savedVersion,
    onCommit,
  })

  return (
    <>
      <input
        aria-label="Retry interval"
        value={field.draft}
        onChange={(event) => field.setDraft(event.target.value)}
        onBlur={() => void field.commit()}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) =>
          field.handleKeyDown(event)
        }
        disabled={field.isCommitting}
      />
      <button type="button" onClick={onImmediateAction}>
        Enable retries
      </button>
    </>
  )
}

describe("useDeferredPreferenceField", () => {
  it("lets the next control receive its click while the field saves on blur", async () => {
    let resolveCommit:
      | ((result: DeferredPreferenceCommitResult) => void)
      | null = null
    const onCommit = vi.fn(
      () =>
        new Promise<DeferredPreferenceCommitResult>((resolve) => {
          resolveCommit = resolve
        }),
    )
    const onImmediateAction = vi.fn()
    const user = userEvent.setup()

    render(
      <DeferredFieldHarness
        savedValue="30"
        savedVersion={1}
        onCommit={onCommit}
        onImmediateAction={onImmediateAction}
      />,
    )

    const input = screen.getByRole("textbox", { name: "Retry interval" })
    await user.clear(input)
    await user.type(input, "45")
    await user.click(screen.getByRole("button", { name: "Enable retries" }))

    expect(onCommit).toHaveBeenCalledWith("45")
    expect(onImmediateAction).toHaveBeenCalledOnce()

    await act(async () => {
      resolveCommit?.({ ok: true, value: "45" })
    })
  })

  it("preserves a dirty field when a newer saved value arrives", async () => {
    const onCommit = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <DeferredFieldHarness
        savedValue="30"
        savedVersion={1}
        onCommit={onCommit}
      />,
    )

    const input = screen.getByRole("textbox", { name: "Retry interval" })
    await user.clear(input)
    await user.type(input, "45")

    rerender(
      <DeferredFieldHarness
        savedValue="40"
        savedVersion={2}
        onCommit={onCommit}
      />,
    )

    expect(input).toHaveValue("45")
  })

  it("commits on Enter and restores the saved value after failure", async () => {
    const onCommit = vi.fn().mockResolvedValue({ ok: false })
    const user = userEvent.setup()
    render(
      <DeferredFieldHarness
        savedValue="30"
        savedVersion={1}
        onCommit={onCommit}
      />,
    )

    const input = screen.getByRole("textbox", { name: "Retry interval" })
    await user.clear(input)
    await user.type(input, "45")
    await user.keyboard("{Enter}")

    expect(onCommit).toHaveBeenCalledWith("45")
    await waitFor(() => expect(input).toHaveValue("30"))
  })
})
