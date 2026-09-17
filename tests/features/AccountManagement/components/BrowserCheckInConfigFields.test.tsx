import {
  fireEvent,
  render as renderWithTestingLibrary,
  screen,
} from "@testing-library/react"
import { useState } from "react"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import { BrowserCheckInConfigFields } from "~/features/AccountManagement/components/AccountDialog/BrowserCheckInConfigFields"
import {
  BROWSER_CHECK_IN_ACTION_KINDS,
  BROWSER_CHECK_IN_DEFAULT_TIMEOUT_MS,
  BROWSER_CHECK_IN_MAX_TIMEOUT_MS,
  BROWSER_CHECK_IN_MIN_TIMEOUT_MS,
  type BrowserCheckInConfig,
} from "~/types/checkinAutomation"
import { testI18n } from "~~/tests/test-utils/i18n"

const TIMEOUT_INPUT_ID = "account-browser-check-in-timeout"

const createConfig = (timeoutMs: number): BrowserCheckInConfig => ({
  enabled: true,
  action: { kind: BROWSER_CHECK_IN_ACTION_KINDS.PageLoad },
  success: { selector: ".check-in-success" },
  timeoutMs,
})

/**
 * Mirrors the real form, where the parent owns the configuration: the field is
 * controlled, so a test must feed emitted updates back in to observe them.
 */
function ControlledFields({
  initialConfig,
  onChange,
}: {
  initialConfig: BrowserCheckInConfig
  onChange: (config: BrowserCheckInConfig) => void
}) {
  const [config, setConfig] = useState(initialConfig)

  return (
    <BrowserCheckInConfigFields
      config={config}
      onChange={(next) => {
        setConfig(next)
        onChange(next)
      }}
    />
  )
}

const renderControlled = (
  initialConfig: BrowserCheckInConfig,
  onChange: (config: BrowserCheckInConfig) => void,
) =>
  renderWithTestingLibrary(
    <I18nextProvider i18n={testI18n}>
      <ControlledFields initialConfig={initialConfig} onChange={onChange} />
    </I18nextProvider>,
  )

const getTimeoutInput = (): HTMLInputElement => {
  const input = document.getElementById(TIMEOUT_INPUT_ID)
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Missing #${TIMEOUT_INPUT_ID} input`)
  }
  return input
}

describe("BrowserCheckInConfigFields", () => {
  it.each([
    ["selector", { selector: ".check-in-success" }],
    ["text", { textPattern: "checked successfully" }],
    ["url", { urlPattern: "/check-in/success$" }],
  ] as const)(
    "displays the configured %s success condition",
    (_kind, success) => {
      const config: BrowserCheckInConfig = {
        enabled: true,
        action: { kind: BROWSER_CHECK_IN_ACTION_KINDS.PageLoad },
        success,
        timeoutMs: 30_000,
      }

      renderWithTestingLibrary(
        <I18nextProvider i18n={testI18n}>
          <BrowserCheckInConfigFields config={config} onChange={vi.fn()} />
        </I18nextProvider>,
      )

      expect(
        screen.getByDisplayValue(Object.values(success)[0]),
      ).toBeInTheDocument()
    },
  )

  it("does not persist a zero timeout when the field is cleared", () => {
    const onChange = vi.fn<(config: BrowserCheckInConfig) => void>()
    renderControlled(createConfig(30_000), onChange)

    expect(getTimeoutInput()).toHaveValue(30_000)

    // `Number("")` is 0, so an empty field must not persist a timeout.
    fireEvent.change(getTimeoutInput(), { target: { value: "" } })

    const emittedTimeouts = onChange.mock.calls.map((call) => call[0].timeoutMs)
    expect(emittedTimeouts.length).toBeGreaterThan(0)
    expect(
      emittedTimeouts.every(
        (value) =>
          value !== undefined && value >= BROWSER_CHECK_IN_MIN_TIMEOUT_MS,
      ),
    ).toBe(true)
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        timeoutMs: BROWSER_CHECK_IN_DEFAULT_TIMEOUT_MS,
      }),
    )
  })

  it("clamps an out-of-range timeout only once editing finishes", () => {
    const onChange = vi.fn<(config: BrowserCheckInConfig) => void>()
    renderControlled(createConfig(30_000), onChange)

    // A partially typed value must survive typing: clamping on every keystroke
    // would rewrite "6" on the way to "60000".
    fireEvent.change(getTimeoutInput(), { target: { value: "6" } })
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ timeoutMs: 6 }),
    )

    fireEvent.change(getTimeoutInput(), { target: { value: "999999" } })
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ timeoutMs: 999_999 }),
    )

    fireEvent.blur(getTimeoutInput())
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ timeoutMs: BROWSER_CHECK_IN_MAX_TIMEOUT_MS }),
    )
  })

  it("raises a below-minimum timeout to the supported floor on blur", () => {
    const onChange = vi.fn<(config: BrowserCheckInConfig) => void>()
    renderControlled(createConfig(30_000), onChange)

    fireEvent.change(getTimeoutInput(), { target: { value: "500" } })
    fireEvent.blur(getTimeoutInput())

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ timeoutMs: BROWSER_CHECK_IN_MIN_TIMEOUT_MS }),
    )
  })

  it("preserves the candidate selector when the text pattern is edited", () => {
    const onChange = vi.fn<(config: BrowserCheckInConfig) => void>()
    renderControlled(
      {
        enabled: true,
        action: {
          kind: BROWSER_CHECK_IN_ACTION_KINDS.ClickText,
          textPattern: "check in",
          candidateSelector: ".actions",
        },
        success: { selector: ".check-in-success" },
        timeoutMs: 30_000,
      },
      onChange,
    )

    fireEvent.change(screen.getByDisplayValue("check in"), {
      target: { value: "check.?in" },
    })

    // Losing the scope here would silently widen the next click.
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: {
          kind: BROWSER_CHECK_IN_ACTION_KINDS.ClickText,
          textPattern: "check.?in",
          candidateSelector: ".actions",
        },
      }),
    )
  })
})
