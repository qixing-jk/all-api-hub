import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { expect, it, vi } from "vitest"

import { VerificationRunAction } from "~/features/Verification/api/VerificationRunAction"
import { VerificationSettingToggle } from "~/features/Verification/api/VerificationSettingToggle"
import { testI18n } from "~~/tests/test-utils/i18n"

it("blocks new runs while keeping stop enabled when the test is running", async () => {
  const user = userEvent.setup()
  const onRun = vi.fn()
  const onStop = vi.fn()
  const action = (running: boolean, canRun: boolean) => (
    <I18nextProvider i18n={testI18n}>
      <VerificationRunAction
        running={running}
        canRun={canRun}
        onRun={onRun}
        onStop={onStop}
        runLabel="Run capacity test"
      />
    </I18nextProvider>
  )
  const view = render(action(false, false))
  const run = screen.getByRole("button", { name: "Run capacity test" })
  expect(run).toBeDisabled()
  await user.click(run)
  expect(onRun).not.toHaveBeenCalled()
  view.rerender(action(false, true))
  await user.click(run)
  expect(onRun).toHaveBeenCalledOnce()
  view.rerender(action(true, false))
  const stop = screen.getByRole("button", {
    name: "aiApiVerification:verifyDialog.tools.stop",
  })
  expect(stop).toBeEnabled()
  await user.click(stop)
  expect(onStop).toHaveBeenCalledOnce()
  expect(onRun).toHaveBeenCalledOnce()
})

it("preserves a continuation label and request-count description", () => {
  render(
    <I18nextProvider i18n={testI18n}>
      <VerificationRunAction
        running={false}
        canRun
        onRun={vi.fn()}
        onStop={vi.fn()}
        runLabel="Continue"
        aria-describedby="request-count"
      >
        Continue <span id="request-count">3 requests</span>
      </VerificationRunAction>
    </I18nextProvider>,
  )
  expect(
    screen.getByRole("button", { name: "Continue" }),
  ).toHaveAccessibleDescription("3 requests")
})

it("keeps a test option labelled, described and controlled while disabling edits during a run", async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  const option = (disabled: boolean) => (
    <VerificationSettingToggle
      id="quick-test"
      label="Quick test"
      hint="Only test the longest input"
      hintId="quick-hint"
      aria-describedby="quick-hint"
      checked={false}
      onChange={onChange}
      disabled={disabled}
    />
  )
  const view = render(option(false))
  const control = screen.getByRole("switch", { name: "Quick test" })
  expect(control).toHaveAccessibleDescription("Only test the longest input")
  await user.click(screen.getByText("Quick test"))
  expect(onChange).toHaveBeenCalledExactlyOnceWith(true)
  view.rerender(option(true))
  expect(control).toBeDisabled()
  await user.click(control)
  expect(onChange).toHaveBeenCalledOnce()
})
