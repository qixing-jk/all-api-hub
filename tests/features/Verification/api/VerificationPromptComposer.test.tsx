import { fireEvent, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import { VerificationModelContext } from "~/features/Verification/api/VerificationModelContext"
import { VerificationPromptComposer } from "~/features/Verification/api/VerificationPromptComposer"
import en from "~/locales/en/aiApiVerification.json"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"
import { render } from "~~/tests/test-utils/render"

describe("verification prompt composer", () => {
  it("gives the current test action a visible Run label", async () => {
    const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
    render(
      <I18nextProvider i18n={i18n}>
        <VerificationPromptComposer
          label="Prompt"
          value="Draft"
          onChange={vi.fn()}
          action={{ onClick: vi.fn() }}
        />
      </I18nextProvider>,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )
    expect(screen.getByRole("button", { name: "Run" })).toHaveTextContent("Run")
  })
  it("explains Enter and Shift+Enter while editing without sending a request", async () => {
    const send = vi.fn()
    const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
    render(
      <I18nextProvider i18n={i18n}>
        <VerificationPromptComposer
          label="Prompt"
          value="Draft"
          onChange={vi.fn()}
          action={{ onClick: send }}
        />
      </I18nextProvider>,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )
    const input = screen.getByRole("textbox", { name: "Prompt" })
    await userEvent.setup().click(input)
    expect(input).toHaveAccessibleDescription(/Enter.*Shift\+Enter/)
    expect(screen.getByText(/Enter.*Shift\+Enter/)).toBeVisible()
    expect(send).not.toHaveBeenCalled()
  })
  it("keeps multiline and IME input separate from sending", async () => {
    const user = userEvent.setup()
    const sent = vi.fn()
    function Composer() {
      const [value, setValue] = useState("First")
      return (
        <VerificationPromptComposer
          label="Prompt"
          value={value}
          onChange={setValue}
          action={{ onClick: () => sent(value) }}
        />
      )
    }
    render(<Composer />, {
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })
    const input = screen.getByRole("textbox", { name: "Prompt" })
    await user.click(input)
    await user.keyboard("{Shift>}{Enter}{/Shift}Second")
    expect(input).toHaveValue("First\nSecond")
    fireEvent.keyDown(input, { key: "Enter", isComposing: true })
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 })
    expect(sent).not.toHaveBeenCalled()
    await user.keyboard("{Enter}")
    expect(sent).toHaveBeenCalledExactlyOnceWith("First\nSecond")
  })

  it("keeps a blocked request from being sent by click or keyboard", async () => {
    const sent = vi.fn()
    render(
      <VerificationPromptComposer
        label="Prompt"
        value="Blocked"
        onChange={vi.fn()}
        action={{ onClick: sent, disabled: true }}
      />,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )
    const input = screen.getByRole("textbox", { name: "Prompt" })
    await userEvent.setup().click(input)
    await userEvent.setup().keyboard("{Enter}")
    expect(sent).not.toHaveBeenCalled()
    expect(screen.getByRole("button")).toBeDisabled()
  })

  it("renders custom modelSelector node when passed", () => {
    render(
      <VerificationPromptComposer
        label="Prompt"
        value="Hello"
        onChange={vi.fn()}
        modelSelector={<button type="button">Custom Model Button</button>}
      />,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )
    expect(
      screen.getByRole("button", { name: "Custom Model Button" }),
    ).toBeInTheDocument()
  })

  it("renders model selector from VerificationModelContext", async () => {
    const user = userEvent.setup()
    const onModelChange = vi.fn()

    render(
      <VerificationModelContext.Provider
        value={{
          modelId: "gpt-4o",
          onModelChange,
          options: ["gpt-4o", "claude-3-5-sonnet"],
        }}
      >
        <VerificationPromptComposer
          label="Prompt"
          value="Test message"
          onChange={vi.fn()}
        />
      </VerificationModelContext.Provider>,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )

    const modelTrigger = screen.getByRole("button", { name: /model/i })
    expect(modelTrigger).toHaveTextContent("gpt-4o")

    await user.click(modelTrigger)
    const claudeOption = await screen.findByText("claude-3-5-sonnet")
    await user.click(claudeOption)

    expect(onModelChange).toHaveBeenCalledWith("claude-3-5-sonnet")
  })

  it("suppresses model selector when modelSelector={false} is set even in context", () => {
    render(
      <VerificationModelContext.Provider
        value={{
          modelId: "gpt-4o",
          onModelChange: vi.fn(),
          options: ["gpt-4o"],
        }}
      >
        <VerificationPromptComposer
          label="Prompt"
          value="Test message"
          onChange={vi.fn()}
          modelSelector={false}
        />
      </VerificationModelContext.Provider>,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )

    expect(
      screen.queryByRole("button", { name: /model/i }),
    ).not.toBeInTheDocument()
  })

  it("does not render label as visible text next to model selector", () => {
    render(
      <VerificationModelContext.Provider
        value={{
          modelId: "gpt-4o",
          onModelChange: vi.fn(),
          options: ["gpt-4o"],
        }}
      >
        <VerificationPromptComposer
          label="Detailed Prompt Label"
          value="Test message"
          onChange={vi.fn()}
        />
      </VerificationModelContext.Provider>,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )

    // The textarea retains the label for accessible identification
    expect(
      screen.getByRole("textbox", { name: "Detailed Prompt Label" }),
    ).toBeInTheDocument()
    // The bottom addon row does not render the redundant visible text
    expect(screen.queryByText("Detailed Prompt Label")).not.toBeInTheDocument()
  })
})
