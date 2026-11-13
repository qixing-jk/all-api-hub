import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { I18nextProvider } from "react-i18next"
import { expect, it, vi } from "vitest"

import {
  VERIFICATION_CONCURRENCY_CONTROL_VARIANTS,
  VerificationConcurrencyControl,
} from "~/features/Verification/api/VerificationConcurrencyControl"
import { VERIFICATION_CONCURRENCY_ERRORS } from "~/hooks/verification/useVerificationConcurrency"
import en from "~/locales/en/aiApiVerification.json"
import { VERIFICATION_CONCURRENCY_KINDS } from "~/services/verification/concurrency"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

it("commits keyboard edits and decrements the edited limit without a blur race", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n(
    { en: { aiApiVerification: en } },
    "en",
  )
  const update = vi.fn()
  function Control() {
    const [value, setValue] = useState(2)
    return (
      <I18nextProvider i18n={i18n}>
        <VerificationConcurrencyControl
          controller={{
            kind: VERIFICATION_CONCURRENCY_KINDS.Needle,
            value,
            ready: true,
            saving: false,
            error: null,
            retry: vi.fn(),
            update: async (next) => {
              update(next)
              setValue(next)
            },
          }}
        />
      </I18nextProvider>
    )
  }
  render(<Control />)
  const input = screen.getByRole("spinbutton")
  await user.clear(input)
  await user.type(input, "6{Enter}")
  expect(update).toHaveBeenLastCalledWith(6)
  expect(input).toHaveAccessibleDescription(
    en.verifyDialog.concurrency.needleHint,
  )
  await user.clear(input)
  await user.type(input, "4")
  update.mockClear()
  await user.click(screen.getByRole("button", { name: "Decrease concurrency" }))
  expect(update).toHaveBeenCalledExactlyOnceWith(3)
  const slider = screen.getByRole("slider")
  fireEvent.change(slider, { target: { value: "5" } })
  fireEvent.keyUp(slider, { key: "ArrowRight" })
  expect(update).toHaveBeenLastCalledWith(5)
  fireEvent.change(slider, { target: { value: "7" } })
  fireEvent.blur(slider)
  expect(update).toHaveBeenLastCalledWith(7)
})

it.each([
  [VERIFICATION_CONCURRENCY_ERRORS.Load, en.verifyDialog.concurrency.loadError],
  [VERIFICATION_CONCURRENCY_ERRORS.Save, en.verifyDialog.concurrency.saveError],
])("offers retry for a %s failure", async (error, message) => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n(
    { en: { aiApiVerification: en } },
    "en",
  )
  const retry = vi.fn()
  render(
    <I18nextProvider i18n={i18n}>
      <VerificationConcurrencyControl
        controller={{
          kind: VERIFICATION_CONCURRENCY_KINDS.Routine,
          value: 2,
          ready: error !== VERIFICATION_CONCURRENCY_ERRORS.Load,
          saving: false,
          error,
          retry,
          update: vi.fn(),
        }}
      />
    </I18nextProvider>,
  )
  expect(screen.getByRole("alert")).toHaveTextContent(message)
  await user.click(
    screen.getByRole("button", { name: en.verifyDialog.concurrency.retry }),
  )
  expect(retry).toHaveBeenCalledOnce()
})

it("commits a chosen preset instead of the draft on pointer focus change", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n(
    { en: { aiApiVerification: en } },
    "en",
  )
  const update = vi.fn()
  function Control() {
    const [saving, setSaving] = useState(false)
    return (
      <I18nextProvider i18n={i18n}>
        <VerificationConcurrencyControl
          showPresets
          controller={{
            kind: VERIFICATION_CONCURRENCY_KINDS.Routine,
            value: 2,
            ready: true,
            saving,
            error: null,
            retry: vi.fn(),
            update: async (value) => {
              update(value)
              setSaving(true)
            },
          }}
        />
      </I18nextProvider>
    )
  }
  render(<Control />)
  const input = screen.getByRole("spinbutton")
  await user.clear(input)
  await user.type(input, "4")
  await user.click(screen.getByRole("button", { name: "1 Safe" }))
  expect(update).toHaveBeenCalledExactlyOnceWith(1)
})

it("edits a bounded batch limit with buttons or direct input and explains the running lock", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n(
    { en: { aiApiVerification: en } },
    "en",
  )
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
  const control = (value: number, disabled = false) => (
    <I18nextProvider i18n={i18n}>
      <VerificationConcurrencyControl
        controller={{ ...controller, value }}
        disabled={disabled}
      />
    </I18nextProvider>
  )
  const { rerender } = render(control(1))
  const input = screen.getByRole("spinbutton", {
    name: en.verifyDialog.concurrency.routine,
  })
  expect(input).toHaveValue(1)
  const slider = screen.getByRole("slider", {
    name: en.verifyDialog.concurrency.routine,
  })
  expect(slider).toHaveValue("1")
  fireEvent.change(slider, { target: { value: "4" } })
  fireEvent.pointerUp(slider)
  expect(update).toHaveBeenLastCalledWith(4)
  rerender(control(4))
  rerender(control(1))
  expect(input).toHaveAccessibleDescription(/one at a time/i)
  expect(
    screen.getByRole("button", { name: "Decrease concurrency" }),
  ).toBeDisabled()
  await user.click(screen.getByRole("button", { name: "Increase concurrency" }))
  expect(update).toHaveBeenLastCalledWith(2)
  rerender(control(2))
  await user.clear(input)
  await user.type(input, "7")
  await user.tab()
  expect(update).toHaveBeenLastCalledWith(7)
  rerender(control(7))
  await user.clear(input)
  await user.type(input, "4")
  update.mockClear()
  await user.click(screen.getByRole("button", { name: "Increase concurrency" }))
  expect(update).toHaveBeenCalledExactlyOnceWith(5)
  rerender(control(5))
  await user.clear(input)
  await user.type(input, "99")
  await user.tab()
  expect(update).toHaveBeenLastCalledWith(10)
  rerender(control(10))
  expect(
    screen.getByRole("button", { name: "Increase concurrency" }),
  ).toBeDisabled()
  rerender(control(10, true))
  expect(input).toBeDisabled()
  expect(input).toHaveAccessibleDescription(/stop.*adjust/i)
})

it("renders compact mode with presets and omits slider", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n(
    { en: { aiApiVerification: en } },
    "en",
  )
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

  render(
    <I18nextProvider i18n={i18n}>
      <VerificationConcurrencyControl
        controller={controller}
        variant={VERIFICATION_CONCURRENCY_CONTROL_VARIANTS.Compact}
        showPresets
      />
    </I18nextProvider>,
  )

  expect(screen.queryByRole("slider")).not.toBeInTheDocument()
  const fastBtn = screen.getByRole("button", { name: "4 Fast" })
  await user.click(fastBtn)
  expect(update).toHaveBeenCalledWith(4)
})
