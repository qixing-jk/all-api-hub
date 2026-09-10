import { act, fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { ResourceSecretListField } from "~/features/ResourceEditor/ResourceSecretListField"
import type {
  ResourceOperationOptions,
  ResourceSecretListValue,
} from "~/services/apiAdapters/contracts/resourceNative"

const t = ((key: string, options?: { number?: number }) =>
  ({
    "ui:secretList.row": `API Key ${options?.number}`,
    "ui:secretList.shortRow": `Key ${options?.number}`,
    "ui:secretList.add": "Add key",
    "ui:secretList.remove": "Remove key",
    "ui:secretList.show": "Show key",
    "ui:secretList.hide": "Hide key",
    "ui:secretList.restore": "Keep saved key",
    "common:actions.cancel": "Cancel",
    "common:status.loading": "Loading",
    "ui:secretList.loadFailed": "Could not load key",
  })[key] ?? key) as TFunction

const initial: ResourceSecretListValue = {
  kind: "secret-list",
  entries: [
    {
      id: "first",
      secret: { kind: "unchanged" },
      fields: { proxy: "http://first.example" },
    },
    {
      id: "second",
      secret: { kind: "unchanged" },
      fields: { proxy: "http://second.example" },
    },
  ],
}

/** Exercise controlled values just as a native resource editor session does. */
function Harness({
  onChange = () => undefined,
  load,
  disabled = false,
  compact = false,
  hasErrors = false,
}: {
  onChange?: (value: ResourceSecretListValue) => void
  load?: (
    fieldId: string,
    options?: ResourceOperationOptions,
  ) => Promise<string>
  disabled?: boolean
  compact?: boolean
  hasErrors?: boolean
}) {
  const [value, setValue] = useState(initial)
  return (
    <ResourceSecretListField
      t={t}
      label="API Keys"
      disabled={disabled}
      hasErrors={hasErrors}
      descriptor={{
        fieldId: "credentials",
        type: "secret-list",
        minEntries: 1,
        savedEntries: [
          { id: "first", secretState: "available", loadFieldId: "load-first" },
          {
            id: "second",
            secretState: "available",
            loadFieldId: "load-second",
          },
        ],
        entryFields: [{ fieldId: "proxy", type: "text" }],
      }}
      presentation={{
        fieldId: "credentials",
        section: "connection",
        order: 1,
        renderer: "secret-list",
        compactSecretRows: compact,
        resolveLabel: () => "API Keys",
        entryFields: [{ fieldId: "proxy", resolveLabel: () => "Proxy" }],
      }}
      value={value}
      onLoadSecret={load}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

const row = (number: number) =>
  within(screen.getByRole("group", { name: `API Key ${number}` }))

describe("ResourceSecretListField", () => {
  it("toggles from the title, summary and keyboard while keeping row actions independent", async () => {
    const user = userEvent.setup()
    const load = vi.fn()
    render(<Harness compact load={load} />)
    await user.click(row(1).getByText("Key 1"))
    expect(row(1).getByLabelText("API Key 1")).toBeVisible()
    const toggle = row(1).getByRole("button", {
      name: "ui:secretList.collapse",
    })
    toggle.focus()
    await user.keyboard(" ")
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    await user.click(row(1).getByText(/Proxy:/))
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    await user.type(row(1).getByLabelText("API Key 1"), "replacement")
    await user.click(row(1).getByRole("button", { name: "Keep saved key" }))
    expect(row(1).getByLabelText("API Key 1")).toHaveValue("")
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    toggle.focus()
    await user.keyboard("{Enter}")
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    await user.click(row(2).getByRole("button", { name: "Remove key" }))
    expect(
      screen.queryByRole("group", { name: "API Key 2" }),
    ).not.toBeInTheDocument()
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(load).not.toHaveBeenCalled()
  })

  it("collapses saved keys without reading secrets and cancels a pending reveal on collapse", async () => {
    const user = userEvent.setup()
    let resolve!: (secret: string) => void
    const load = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done
        }),
    )
    const change = vi.fn()
    render(<Harness compact load={load} onChange={change} />)
    expect(
      row(1).queryByRole("button", { name: "Show key" }),
    ).not.toBeInTheDocument()
    expect(load).not.toHaveBeenCalled()
    await user.click(
      row(1).getByRole("button", { name: "ui:secretList.expand" }),
    )
    await user.click(row(1).getByRole("button", { name: "Show key" }))
    await user.click(
      row(1).getByRole("button", { name: "ui:secretList.collapse" }),
    )
    await act(async () => resolve("late-secret"))
    await user.click(
      row(1).getByRole("button", { name: "ui:secretList.expand" }),
    )
    expect(row(1).getByLabelText("API Key 1")).toHaveValue("")
    expect(change).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Add key" }))
    expect(row(3).getByLabelText("API Key 3")).toBeVisible()
  })

  it("expands saved credentials when the adapter reports a collection validation error", () => {
    const view = render(<Harness compact />)
    expect(row(1).getByLabelText("API Key 1")).not.toBeVisible()
    view.rerender(<Harness compact hasErrors />)
    expect(row(1).getByLabelText("API Key 1")).toBeVisible()
    expect(row(2).getByLabelText("API Key 2")).toBeVisible()
    view.rerender(<Harness compact />)
    expect(row(1).getByLabelText("API Key 1")).toBeVisible()
  })

  it("loads and hides individual saved keys without dirtying the projection", async () => {
    const user = userEvent.setup()
    const load = vi.fn().mockResolvedValue("saved-secret")
    const change = vi.fn()
    render(<Harness load={load} onChange={change} />)
    expect(row(1).getByLabelText("API Key 1")).toHaveValue("")
    await user.click(row(2).getByRole("button", { name: "Show key" }))
    expect(load).toHaveBeenCalledWith(
      "load-second",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(row(2).getByLabelText("API Key 2")).toHaveValue("saved-secret")
    expect(row(2).getByLabelText("API Key 2")).toHaveAttribute("type", "text")
    expect(row(1).getByLabelText("API Key 1")).toHaveValue("")
    await user.click(row(2).getByRole("button", { name: "Hide key" }))
    expect(row(2).getByLabelText("API Key 2")).toHaveValue("")
    expect(change).not.toHaveBeenCalled()
  })

  it("keeps revealed edits visible and identifies a replacement key", async () => {
    const user = userEvent.setup()
    const load = vi.fn().mockResolvedValue("saved-secret")
    render(<Harness load={load} />)
    expect(row(1).getByText("ui:secretList.retainedState")).toBeVisible()
    await user.click(row(1).getByRole("button", { name: "Show key" }))
    await user.type(row(1).getByLabelText("API Key 1"), "-edited")
    expect(row(1).getByLabelText("API Key 1")).toHaveAttribute("type", "text")
    expect(row(1).getByLabelText("API Key 1")).toHaveValue(
      "saved-secret-edited",
    )
    expect(row(1).getByText("ui:secretList.replacementState")).toBeVisible()
  })

  it("returns a cleared replacement to the masked saved-key state", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(row(1).getByLabelText("API Key 1"))
    await user.paste("replacement")
    await user.click(row(1).getByRole("button", { name: "Show key" }))
    expect(row(1).getByLabelText("API Key 1")).toHaveAttribute("type", "text")
    await user.clear(row(1).getByLabelText("API Key 1"))
    expect(row(1).getByText("ui:secretList.retainedState")).toBeVisible()
    expect(row(1).getByLabelText("API Key 1")).toHaveAttribute(
      "type",
      "password",
    )
  })

  it("identifies new keys and preserves their visibility while editing", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole("button", { name: "Add key" }))
    expect(row(3).getByText("ui:secretList.newState")).toBeVisible()
    await user.click(row(3).getByRole("button", { name: "Show key" }))
    await user.click(row(3).getByLabelText("API Key 3"))
    await user.paste("new-visible-key")
    expect(row(3).getByLabelText("API Key 3")).toHaveValue("new-visible-key")
    expect(row(3).getByLabelText("API Key 3")).toHaveAttribute("type", "text")
  })

  it("adds, edits and removes rows without changing neighboring credentials", async () => {
    const user = userEvent.setup()
    const change = vi.fn()
    render(<Harness onChange={change} />)
    await user.click(screen.getByRole("button", { name: "Add key" }))
    await user.click(row(3).getByLabelText("API Key 3"))
    await user.paste("added-key")
    await user.clear(row(1).getByLabelText("Proxy"))
    await user.paste("http://changed.example")
    await user.click(row(2).getByRole("button", { name: "Remove key" }))
    const value = change.mock.lastCall![0] as ResourceSecretListValue
    expect(value.entries).toHaveLength(2)
    expect(value.entries[0]).toEqual({
      ...initial.entries[0],
      fields: { proxy: "http://changed.example" },
    })
    expect(value.entries[1].secret).toEqual({
      kind: "replace",
      value: "added-key",
    })
    expect(row(2).getByLabelText("API Key 2")).toHaveValue("added-key")
  })

  it("keeps the last required credential and retains key state when attributes change", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(row(1).getByLabelText("Proxy"), "/changed")
    expect(row(1).getByText("ui:secretList.retainedState")).toBeVisible()
    await user.click(row(2).getByRole("button", { name: "Remove key" }))
    expect(row(1).getByRole("button", { name: "Remove key" })).toBeDisabled()
  })

  it.each(["replace", "remove", "cancel"])(
    "discards a late secret read after %s",
    async (action) => {
      const user = userEvent.setup()
      let resolve!: (value: string) => void
      let signal: AbortSignal | undefined
      const load = vi.fn((_id: string, options?: ResourceOperationOptions) => {
        signal = options?.signal
        return new Promise<string>((done) => {
          resolve = done
        })
      })
      render(<Harness load={load} />)
      await user.click(row(1).getByRole("button", { name: "Show key" }))
      if (action === "replace")
        fireEvent.change(row(1).getByLabelText("API Key 1"), {
          target: { value: "replacement" },
        })
      if (action === "remove")
        await user.click(row(1).getByRole("button", { name: "Remove key" }))
      if (action === "cancel")
        await user.click(row(1).getByRole("button", { name: "Cancel" }))
      expect(signal?.aborted).toBe(true)
      await act(async () => resolve("late-secret"))
      expect(screen.queryByDisplayValue("late-secret")).not.toBeInTheDocument()
      if (action === "replace")
        expect(row(1).getByLabelText("API Key 1")).toHaveValue("replacement")
    },
  )

  it("restores the saved-key intent after entering a replacement", async () => {
    const user = userEvent.setup()
    const change = vi.fn()
    render(<Harness onChange={change} />)
    await user.type(row(1).getByLabelText("API Key 1"), "replacement")
    await user.click(row(1).getByRole("button", { name: "Keep saved key" }))
    expect(change.mock.lastCall![0].entries[0].secret).toEqual({
      kind: "unchanged",
    })
    expect(row(1).getByLabelText("API Key 1")).toHaveValue("")
  })

  it("shows a safe recoverable load failure and disables all edits in read-only mode", async () => {
    const user = userEvent.setup()
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("sensitive server data"))
      .mockResolvedValue("retry-secret")
    const { rerender } = render(<Harness load={load} />)
    await user.click(row(1).getByRole("button", { name: "Show key" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load key")
    expect(screen.queryByText("sensitive server data")).not.toBeInTheDocument()
    await user.click(row(1).getByRole("button", { name: "Show key" }))
    expect(row(1).getByLabelText("API Key 1")).toHaveValue("retry-secret")
    rerender(<Harness load={load} disabled />)
    expect(row(1).getByLabelText("API Key 1")).toHaveValue("")
    expect(row(1).getByLabelText("Proxy")).toBeDisabled()
    expect(screen.getByRole("button", { name: "Add key" })).toBeDisabled()
    expect(row(1).getByRole("button", { name: "Remove key" })).toBeDisabled()
  })
})
