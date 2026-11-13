import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { PromptModelSelector } from "~/components/ai-elements/model-selector"
import { render } from "~~/tests/test-utils/render"

describe("PromptModelSelector", () => {
  it("explains an empty search result when custom models are disabled", async () => {
    const user = userEvent.setup()
    render(
      <PromptModelSelector
        value=""
        onChange={vi.fn()}
        options={["gpt-4o"]}
        allowCustomValue={false}
        emptyMessage="No matching models"
      />,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )
    await user.click(screen.getByRole("button", { name: /model/i }))
    await user.type(await screen.findByRole("combobox"), "unrelated")
    expect(await screen.findByText("No matching models")).toBeVisible()
    expect(screen.queryByRole("option")).not.toBeInTheDocument()
  })
  it("renders trigger with placeholder when no model is selected", () => {
    render(
      <PromptModelSelector
        value=""
        onChange={vi.fn()}
        placeholder="Select model"
      />,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )

    const trigger = screen.getByRole("button", { name: /model/i })
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveTextContent("Select model")
  })

  it("renders trigger with current model name", () => {
    render(
      <PromptModelSelector
        value="gpt-4o"
        onChange={vi.fn()}
        placeholder="Select model"
      />,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )

    const trigger = screen.getByRole("button", { name: /model/i })
    expect(trigger).toHaveTextContent("gpt-4o")
  })

  it("opens popover and allows selecting an existing model option", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    function Wrapper() {
      const [model, setModel] = useState("gpt-4o")
      return (
        <PromptModelSelector
          value={model}
          onChange={(val) => {
            setModel(val)
            onChange(val)
          }}
          options={[
            { value: "gpt-4o", label: "GPT-4o" },
            { value: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet" },
            { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
          ]}
        />
      )
    }

    render(<Wrapper />, {
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    const trigger = screen.getByRole("button", { name: /model/i })
    await user.click(trigger)

    const claudeOption = await screen.findByText("Claude 3.5 Sonnet")
    await user.click(claudeOption)

    expect(onChange).toHaveBeenCalledWith("claude-3-5-sonnet")
    expect(trigger).toHaveTextContent("Claude 3.5 Sonnet")
  })

  it("allows typing and submitting a custom model value", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    function Wrapper() {
      const [model, setModel] = useState("")
      return (
        <PromptModelSelector
          value={model}
          onChange={(val) => {
            setModel(val)
            onChange(val)
          }}
          options={["gpt-4o", "claude-3-5-sonnet"]}
          allowCustomValue
        />
      )
    }

    render(<Wrapper />, {
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    const trigger = screen.getByRole("button", { name: /model/i })
    await user.click(trigger)

    const searchInput = await screen.findByRole("combobox")
    await user.type(searchInput, "deepseek-v3")

    const customOption = await screen.findByText(/deepseek-v3/i)
    await user.click(customOption)

    expect(onChange).toHaveBeenCalledWith("deepseek-v3")
  })

  it("respects disabled state", () => {
    render(<PromptModelSelector value="gpt-4o" onChange={vi.fn()} disabled />, {
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    const trigger = screen.getByRole("button", { name: /model/i })
    expect(trigger).toBeDisabled()
  })
})
