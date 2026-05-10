import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import ActionButtons from "~/features/AccountManagement/components/AccountDialog/ActionButtons"
import { ACCOUNT_POST_SAVE_WORKFLOW_STEPS } from "~/services/accounts/accountPostSaveWorkflow"
import { render, screen } from "~~/tests/test-utils/render"

describe("AccountDialog ActionButtons", () => {
  const createProps = (): ComponentProps<typeof ActionButtons> => ({
    mode: DIALOG_MODES.ADD,
    url: "https://api.example.com",
    phase: "account-form",
    formSource: "manual",
    isDetecting: false,
    isSaving: false,
    isFormValid: true,
    onAutoDetect: vi.fn(),
    onShowManualForm: vi.fn(),
    onClose: vi.fn(),
    onAutoConfig: vi.fn().mockResolvedValue(undefined),
    isAutoConfiguring: false,
    accountPostSaveWorkflowStep: ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle,
    formId: "account-form",
  })

  it("shows the pre-form auto-detect layout in add mode and disables it without a URL", async () => {
    const user = userEvent.setup()
    const props = createProps()
    props.url = "   "
    props.phase = "site-input"

    render(<ActionButtons {...props} />)

    const autoDetectButton = await screen.findByRole("button", {
      name: "accountDialog:mode.autoDetect",
    })
    const manualAddButton = await screen.findByRole("button", {
      name: "accountDialog:mode.manualAdd",
    })

    expect(autoDetectButton).toBeDisabled()
    expect(manualAddButton).toBeDisabled()
    expect(
      screen.queryByRole("button", { name: "common:actions.cancel" }),
    ).toBeNull()

    await user.click(autoDetectButton)
    await user.click(manualAddButton)

    expect(props.onAutoDetect).not.toHaveBeenCalled()
    expect(props.onShowManualForm).not.toHaveBeenCalled()
  })

  it("keeps the manual add action available while auto-detect is already running", async () => {
    const user = userEvent.setup()
    const props = createProps()
    props.isDetecting = true
    props.phase = "site-input"

    render(<ActionButtons {...props} />)

    expect(
      await screen.findByRole("button", {
        name: /accountDialog:mode\.detecting/i,
      }),
    ).toBeDisabled()

    const manualAddButton = await screen.findByRole("button", {
      name: "accountDialog:mode.manualAdd",
    })
    expect(manualAddButton).toBeEnabled()

    await user.click(manualAddButton)

    expect(props.onShowManualForm).toHaveBeenCalledTimes(1)
  })

  it("shows edit-mode cancel, re-detect, and save actions without add-only controls", async () => {
    const user = userEvent.setup()
    const props = createProps()
    props.mode = DIALOG_MODES.EDIT

    render(<ActionButtons {...props} />)

    expect(
      await screen.findByRole("button", { name: "common:actions.cancel" }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole("button", {
        name: "accountDialog:mode.reDetect",
      }),
    ).toBeEnabled()

    const submitButton = await screen.findByRole("button", {
      name: "accountDialog:actions.saveChanges",
    })
    expect(submitButton).toBeEnabled()
    expect(submitButton).toHaveAttribute("form", "account-form")
    expect(
      screen.queryByRole("button", {
        name: "accountDialog:actions.configToManagedSite",
      }),
    ).toBeNull()

    await user.click(
      await screen.findByRole("button", { name: "common:actions.cancel" }),
    )
    await user.click(
      await screen.findByRole("button", {
        name: "accountDialog:mode.reDetect",
      }),
    )

    expect(props.onClose).toHaveBeenCalledTimes(1)
    expect(props.onAutoDetect).toHaveBeenCalledTimes(1)
  })

  it("shows add-mode auto-config and save actions, and wires the auto-config handler", async () => {
    const user = userEvent.setup()
    const props = createProps()
    props.formSource = "manual"

    render(<ActionButtons {...props} />)

    expect(
      await screen.findByRole("button", { name: "common:actions.cancel" }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole("button", {
        name: "accountDialog:actions.saveAccount",
      }),
    ).toBeEnabled()

    const autoConfigButton = await screen.findByRole("button", {
      name: "accountDialog:actions.autoConfigAriaLabel",
    })
    expect(autoConfigButton).toHaveAttribute(
      "title",
      "accountDialog:actions.autoConfigTitle",
    )

    await user.click(autoConfigButton)

    expect(props.onAutoConfig).toHaveBeenCalledTimes(1)
  })

  it("disables auto-config and shows the blocking reason when the visible form becomes invalid", async () => {
    const user = userEvent.setup()
    const props = createProps()
    props.formSource = "detected"
    props.isFormValid = false

    render(<ActionButtons {...props} />)

    const autoConfigButton = await screen.findByRole("button", {
      name: "accountDialog:actions.autoConfigAriaLabel",
    })

    expect(autoConfigButton).toBeDisabled()
    expect(autoConfigButton).toHaveAttribute(
      "title",
      "accountDialog:actions.autoConfigRequiresValidAccount",
    )

    await user.click(autoConfigButton)

    expect(props.onAutoConfig).not.toHaveBeenCalled()
  })

  it("switches submit labels for detected and saving states and disables submission while busy", async () => {
    const props = createProps()
    props.formSource = "detected"

    const { rerender } = render(<ActionButtons {...props} />)

    expect(
      await screen.findByRole("button", {
        name: "accountDialog:actions.confirmAdd",
      }),
    ).toBeEnabled()

    rerender(
      <ActionButtons
        {...props}
        isSaving={true}
        isAutoConfiguring={true}
        formSource="manual"
      />,
    )

    expect(
      await screen.findByRole("button", { name: /common:status\.saving/i }),
    ).toBeDisabled()
    expect(
      await screen.findByRole("button", {
        name: "accountDialog:actions.autoConfigAriaLabel",
      }),
    ).toBeDisabled()
    expect(
      screen.getByText("accountDialog:actions.configuring"),
    ).toBeInTheDocument()
  })
})
