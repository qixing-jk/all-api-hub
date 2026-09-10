import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import {
  ChannelModelsField,
  ChannelSecretField,
} from "~/components/dialogs/ChannelDialog/components/ChannelFields"
import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"

const t = ((key: string) => key) as TFunction

function FilterableModelsHarness({
  initialSelected = ["gpt-4", "custom-model"],
  withGlobalBulkActions = true,
}: {
  initialSelected?: string[]
  withGlobalBulkActions?: boolean
}) {
  const [selected, setSelected] = useState(initialSelected)

  return (
    <>
      <ChannelModelsField
        t={t}
        options={[
          { value: "gpt-4", label: "gpt-4" },
          { value: "deepseek-chat", label: "deepseek-chat" },
          { value: "deepseek-reasoner", label: "deepseek-reasoner" },
        ]}
        selected={selected}
        onChange={setSelected}
        disabled={false}
        onSelectAll={
          withGlobalBulkActions
            ? () => setSelected(["gpt-4", "deepseek-chat", "deepseek-reasoner"])
            : undefined
        }
        onInverse={
          withGlobalBulkActions
            ? () => setSelected(["deepseek-chat", "deepseek-reasoner"])
            : undefined
        }
        onDeselectAll={
          withGlobalBulkActions ? () => setSelected([]) : undefined
        }
      />
      <output aria-label="Selected models">{selected.join(",")}</output>
    </>
  )
}

describe("ChannelFields", () => {
  it("keeps a loading secret action cancelable and associates its hint with the input", async () => {
    const user = userEvent.setup()
    const onLoadRealKey = vi.fn()
    const onCancelLoadRealKey = vi.fn()

    const view = render(
      <ChannelSecretField
        t={t}
        value=""
        onChange={vi.fn()}
        disabled={false}
        revealed={false}
        onRevealedChange={vi.fn()}
        canLoadRealKey
        isLoadingRealKey={false}
        onLoadRealKey={onLoadRealKey}
        onCancelLoadRealKey={onCancelLoadRealKey}
        loadRealKeyLabel="View saved API key"
        cancelLoadRealKeyLabel="Cancel loading"
        realKeyHint="The saved API key is not shown here."
      />,
    )

    const input = screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.keyInput)
    const hint = screen.getByText("The saved API key is not shown here.")
    expect(input.getAttribute("aria-describedby")?.split(" ")).toContain(
      hint.id,
    )
    expect(input).toHaveAccessibleDescription(
      "The saved API key is not shown here.",
    )
    await user.click(screen.getByRole("button", { name: "View saved API key" }))
    expect(onLoadRealKey).toHaveBeenCalledOnce()

    view.rerender(
      <ChannelSecretField
        t={t}
        value=""
        onChange={vi.fn()}
        disabled={false}
        revealed={false}
        onRevealedChange={vi.fn()}
        canLoadRealKey
        isLoadingRealKey
        onLoadRealKey={onLoadRealKey}
        onCancelLoadRealKey={onCancelLoadRealKey}
        loadRealKeyLabel="View saved API key"
        cancelLoadRealKeyLabel="Cancel loading"
        realKeyHint="The saved API key is not shown here."
      />,
    )

    const cancelButton = screen.getByRole("button", {
      name: "Cancel loading",
    })
    expect(cancelButton).toBeEnabled()
    expect(cancelButton).toHaveAttribute("aria-busy", "true")
    expect(cancelButton).toHaveAttribute("aria-live", "polite")
    await user.click(cancelButton)
    expect(onCancelLoadRealKey).toHaveBeenCalledOnce()
  })

  it("associates an unavailable saved-key explanation with the secret input", () => {
    render(
      <ChannelSecretField
        t={t}
        value=""
        onChange={vi.fn()}
        disabled={false}
        revealed={false}
        onRevealedChange={vi.fn()}
        realKeyUnavailableMessage="This site type cannot show saved keys. Enter a new key to replace it."
      />,
    )

    const input = screen.getByTestId(CHANNEL_DIALOG_TEST_IDS.keyInput)
    expect(input).toHaveAccessibleDescription(
      "This site type cannot show saved keys. Enter a new key to replace it.",
    )
    expect(
      screen.getByText(
        "This site type cannot show saved keys. Enter a new key to replace it.",
      ),
    ).toBeVisible()
  })

  it("renders injected model actions beside the shared bulk actions", async () => {
    const user = userEvent.setup()
    const onInjectedAction = vi.fn()

    render(
      <ChannelModelsField
        t={t}
        options={[{ value: "model-example", label: "Example model" }]}
        selected={[]}
        onChange={vi.fn()}
        disabled={false}
        onSelectAll={vi.fn()}
        onInverse={vi.fn()}
        onDeselectAll={vi.fn()}
        actions={
          <button type="button" onClick={onInjectedAction}>
            Refresh models
          </button>
        }
      />,
    )

    expect(
      screen.getByRole("button", { name: "channelDialog:actions.selectAll" }),
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Refresh models" }))
    expect(onInjectedAction).toHaveBeenCalledOnce()
  })

  it("provides filtered bulk actions without global bulk callbacks", async () => {
    const user = userEvent.setup()

    render(<FilterableModelsHarness withGlobalBulkActions={false} />)

    expect(
      screen.getByRole("button", { name: "ui:multiSelect.selectAll" }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "ui:multiSelect.cancelSelected" }),
    ).toBeVisible()

    await user.type(
      screen.getByRole("combobox", {
        name: "channelDialog:fields.models.label",
      }),
      "deepseek",
    )
    await user.click(
      screen.getByRole("button", {
        name: "ui:multiSelect.selectAllMatches",
      }),
    )

    expect(screen.getByLabelText("Selected models")).toHaveTextContent(
      "gpt-4,custom-model,deepseek-chat,deepseek-reasoner",
    )
  })

  it("selects only matching models while preserving selections outside the filter", async () => {
    const user = userEvent.setup()

    render(<FilterableModelsHarness />)

    expect(
      screen.getByRole("button", {
        name: "channelDialog:actions.selectAll",
      }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: "channelDialog:actions.inverse",
      }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: "channelDialog:actions.deselectAll",
      }),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "ui:multiSelect.selectAll" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "ui:multiSelect.cancelSelected",
      }),
    ).not.toBeInTheDocument()

    const modelsInput = screen.getByRole("combobox", {
      name: "channelDialog:fields.models.label",
    })
    await user.type(modelsInput, "deepseek")
    await user.click(
      screen.getByRole("button", {
        name: "ui:multiSelect.selectAllMatches",
      }),
    )

    expect(screen.getByLabelText("Selected models")).toHaveTextContent(
      "gpt-4,custom-model,deepseek-chat,deepseek-reasoner",
    )
    expect(modelsInput).toHaveAttribute("aria-expanded", "true")
    expect(
      screen.getByRole("button", {
        name: "ui:multiSelect.invertMatches",
      }),
    ).toBeVisible()
  })

  it("inverts only matching models while preserving selections outside the filter", async () => {
    const user = userEvent.setup()

    render(
      <FilterableModelsHarness
        initialSelected={["gpt-4", "custom-model", "deepseek-chat"]}
      />,
    )

    await user.type(
      screen.getByRole("combobox", {
        name: "channelDialog:fields.models.label",
      }),
      "deepseek",
    )

    await user.click(
      screen.getByRole("button", {
        name: "ui:multiSelect.invertMatches",
      }),
    )
    expect(screen.getByLabelText("Selected models")).toHaveTextContent(
      "gpt-4,custom-model,deepseek-reasoner",
    )
  })

  it("deselects only matching models while preserving selections outside the filter", async () => {
    const user = userEvent.setup()

    render(
      <FilterableModelsHarness
        initialSelected={[
          "gpt-4",
          "custom-model",
          "deepseek-chat",
          "deepseek-reasoner",
        ]}
      />,
    )

    await user.type(
      screen.getByRole("combobox", {
        name: "channelDialog:fields.models.label",
      }),
      "deepseek",
    )
    await user.click(
      screen.getByRole("button", {
        name: "ui:multiSelect.deselectMatches",
      }),
    )
    expect(screen.getByLabelText("Selected models")).toHaveTextContent(
      "gpt-4,custom-model",
    )
  })

  it("hides filtered bulk actions when no model matches", async () => {
    const user = userEvent.setup()

    render(<FilterableModelsHarness />)

    await user.type(
      screen.getByRole("combobox", {
        name: "channelDialog:fields.models.label",
      }),
      "no-such-model",
    )

    expect(
      screen.queryByRole("group", {
        name: "ui:multiSelect.filteredResultsScope",
      }),
    ).not.toBeInTheDocument()
    expect(screen.getByText("ui:searchableSelect.empty")).toBeVisible()
  })
})
