import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { describe, expect, it, vi } from "vitest"

import { ChannelCommonFieldsBody } from "~/components/dialogs/ChannelDialog/components/ChannelCommonFieldsBody"
import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"

const t = ((key: string) => key) as TFunction

describe("ChannelCommonFieldsBody", () => {
  it("keeps stable ids, common focus order, and the advanced disclosure contract", async () => {
    const user = userEvent.setup()

    render(
      <ChannelCommonFieldsBody
        t={t}
        values={{
          name: "Example channel",
          type: "openai",
          key: "secret-placeholder",
          baseURL: "https://api.example.invalid",
          models: [],
          groups: [],
          priority: 0,
          weight: 0,
          status: "enabled",
        }}
        channelTypeOptions={[{ value: "openai", label: "OpenAI" }]}
        availableModels={[]}
        availableGroups={[]}
        statusOptions={[{ value: "enabled", label: "Enabled" }]}
        isViewMode={false}
        isAddMode
        isInteractionDisabled={false}
        isKeyRequired
        isBaseURLRequired={false}
        isKeyRevealed={false}
        canLoadRealKey={false}
        isLoadingRealKey={false}
        isLoadingModels={false}
        isLoadingGroups={false}
        showUnknownStringType={false}
        showGenericModelsField
        showGroupsField={false}
        showPriorityAndWeight={false}
        showModelPrefillWarning={false}
        onNameChange={vi.fn()}
        onTypeChange={vi.fn()}
        onKeyChange={vi.fn()}
        onKeyRevealedChange={vi.fn()}
        onLoadRealKey={vi.fn()}
        onBaseURLChange={vi.fn()}
        onModelsChange={vi.fn()}
        onGroupsChange={vi.fn()}
        onSelectAllModels={vi.fn()}
        onInverseModels={vi.fn()}
        onDeselectAllModels={vi.fn()}
        onPriorityChange={vi.fn()}
        onWeightChange={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    )

    const nameInput = screen.getByRole("textbox", {
      name: /channelDialog:fields.name.label/,
    })
    const typeSelect = screen.getByRole("combobox", {
      name: /channelDialog:fields.type.label/,
    })
    const keyInput = screen.getByLabelText(/^channelDialog:fields.key.label/)
    const revealButton = screen.getByRole("button", {
      name: "channelDialog:actions.showKey",
    })
    const baseUrlInput = screen.getByRole("textbox", {
      name: "channelDialog:fields.baseUrl.label",
    })
    const modelsInput = screen.getByRole("combobox", {
      name: "channelDialog:fields.models.label",
    })
    const advancedSummary = screen.getByText(
      "channelDialog:sections.advanced",
      { selector: "summary" },
    )
    const statusSelect = screen.getByRole("combobox", {
      name: "channelDialog:fields.status.label",
    })

    expect(nameInput).toHaveAttribute(
      "data-testid",
      CHANNEL_DIALOG_TEST_IDS.nameInput,
    )
    expect(typeSelect).toHaveAttribute(
      "data-testid",
      CHANNEL_DIALOG_TEST_IDS.typeSelect,
    )
    expect(keyInput).toHaveAttribute(
      "data-testid",
      CHANNEL_DIALOG_TEST_IDS.keyInput,
    )
    expect(baseUrlInput).toHaveAttribute(
      "data-testid",
      CHANNEL_DIALOG_TEST_IDS.baseUrlInput,
    )
    expect(modelsInput).toHaveAttribute(
      "data-testid",
      CHANNEL_DIALOG_TEST_IDS.modelsInput,
    )
    expect(statusSelect).toHaveAttribute(
      "data-testid",
      CHANNEL_DIALOG_TEST_IDS.statusSelect,
    )

    await user.tab()
    expect(nameInput).toHaveFocus()
    await user.tab()
    expect(typeSelect).toHaveFocus()
    await user.tab()
    expect(keyInput).toHaveFocus()
    await user.tab()
    expect(revealButton).toHaveFocus()
    await user.tab()
    expect(baseUrlInput).toHaveFocus()
    await user.tab()
    expect(modelsInput).toHaveFocus()

    const advancedDetails = advancedSummary.closest("details")
    expect(advancedDetails).not.toBeNull()
    expect(advancedDetails).not.toHaveAttribute("open")
    expect(advancedSummary).toHaveProperty("tabIndex", 0)

    // jsdom does not model summary keyboard activation or closed-details tabbing.
    // Keep this contract to native focusability, user expansion, and expanded order.
    await user.click(advancedSummary)
    expect(advancedDetails).toHaveAttribute("open")
    advancedSummary.focus()
    expect(advancedSummary).toHaveFocus()
    await user.click(statusSelect)
    expect(statusSelect).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("option", { name: "Enabled" })).toHaveFocus()
  })
})
