import {
  render as renderWithTestingLibrary,
  screen,
} from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import { BrowserCheckInConfigFields } from "~/features/AccountManagement/components/AccountDialog/BrowserCheckInConfigFields"
import {
  BROWSER_CHECK_IN_ACTION_KINDS,
  type BrowserCheckInConfig,
} from "~/types/checkinAutomation"
import { testI18n } from "~~/tests/test-utils/i18n"

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
})
