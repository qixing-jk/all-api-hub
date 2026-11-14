import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import { VerificationRunAllButton } from "~/features/Verification/api/VerificationRunAllButton"
import en from "~/locales/en/aiApiVerification.json"
import { VERIFICATION_CONCURRENCY_KINDS } from "~/services/verification/concurrency"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

describe("VerificationRunAllButton", () => {
  it("keeps the routine concurrency compact and explains it on demand", async () => {
    const i18n = await createResourceTestI18n(
      { en: { aiApiVerification: en } },
      "en",
    )
    render(
      <I18nextProvider i18n={i18n}>
        <VerificationRunAllButton
          isRunning={false}
          concurrency={{
            kind: VERIFICATION_CONCURRENCY_KINDS.Routine,
            value: 4,
            ready: true,
            saving: false,
            error: null,
            update: vi.fn(),
            retry: vi.fn(),
          }}
          onRun={vi.fn()}
          onStop={vi.fn()}
        />
      </I18nextProvider>,
    )
    const options = screen.getByRole("button", {
      name: /run preferences and concurrency/i,
    })
    expect(options).toHaveTextContent(/^4$/)
    expect(options).toHaveAccessibleDescription("Parallel: 4")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
  it("renders a split button in idle state, triggers run, and opens options popover to select presets", async () => {
    const user = userEvent.setup()
    const i18n = await createResourceTestI18n(
      { en: { aiApiVerification: en } },
      "en",
    )
    const onRun = vi.fn()
    const onStop = vi.fn()
    const update = vi.fn()
    const controller = {
      kind: VERIFICATION_CONCURRENCY_KINDS.Routine,
      value: 1,
      ready: true,
      saving: false,
      error: null,
      update,
      retry: vi.fn(),
    }

    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <VerificationRunAllButton
          isRunning={false}
          concurrency={controller}
          onRun={onRun}
          onStop={onStop}
        />
      </I18nextProvider>,
    )

    const runButton = screen.getByRole("button", {
      name: en.verifyDialog.actions.runAll,
    })
    expect(runButton).toBeInTheDocument()

    const optionsTrigger = screen.getByRole("button", {
      name: /run preferences and concurrency/i,
    })
    expect(optionsTrigger).toBeInTheDocument()

    // Clicking main button calls onRun
    await user.click(runButton)
    expect(onRun).toHaveBeenCalledTimes(1)

    // Clicking options trigger opens popover
    await user.click(optionsTrigger)
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText(/run options/i)).toBeInTheDocument()

    // Check presets exist
    const safePreset = screen.getByRole("button", { name: /1 safe/i })
    const moderatePreset = screen.getByRole("button", { name: /2 moderate/i })
    const fastPreset = screen.getByRole("button", { name: /4 fast/i })

    expect(safePreset).toBeInTheDocument()
    expect(moderatePreset).toBeInTheDocument()
    expect(fastPreset).toBeInTheDocument()

    // Click moderate preset
    await user.click(moderatePreset)
    expect(update).toHaveBeenCalledWith(2)

    // Switch to running state
    rerender(
      <I18nextProvider i18n={i18n}>
        <VerificationRunAllButton
          isRunning={true}
          concurrency={controller}
          onRun={onRun}
          onStop={onStop}
        />
      </I18nextProvider>,
    )

    // In running state, options trigger is replaced with a single stop button
    expect(
      screen.queryByRole("button", { name: /run preferences/i }),
    ).not.toBeInTheDocument()
    const stopButton = screen.getByRole("button", {
      name: en.verifyDialog.actions.stop,
    })
    expect(stopButton).toBeInTheDocument()

    await user.click(stopButton)
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it("disables both run button and options trigger when disabled", async () => {
    const i18n = await createResourceTestI18n(
      { en: { aiApiVerification: en } },
      "en",
    )
    const controller = {
      kind: VERIFICATION_CONCURRENCY_KINDS.Routine,
      value: 1,
      ready: true,
      saving: false,
      error: null,
      update: vi.fn(),
      retry: vi.fn(),
    }

    render(
      <I18nextProvider i18n={i18n}>
        <VerificationRunAllButton
          isRunning={false}
          disabled={true}
          concurrency={controller}
          onRun={vi.fn()}
          onStop={vi.fn()}
        />
      </I18nextProvider>,
    )

    expect(
      screen.getByRole("button", { name: en.verifyDialog.actions.runAll }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: /run preferences and concurrency/i }),
    ).toBeDisabled()
  })
})
