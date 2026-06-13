import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createInstance } from "i18next"
import type { ReactNode } from "react"
import { I18nextProvider, initReactI18next } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import { RootErrorBoundary } from "~/components/RootErrorBoundary"

const { loggerErrorMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: loggerErrorMock,
    info: vi.fn(),
    warn: vi.fn(),
  }),
}))

const i18n = createInstance()

await i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  ns: ["common"],
  defaultNS: "common",
  resources: {
    en: {
      common: {
        rootErrorBoundary: {
          description:
            "The page could not be displayed correctly. Reload first. If this keeps happening, turn off automatic translation for this page or switch to the language you need in extension settings.",
          reload: "Reload page",
          requestLanguage: "Request a language",
          title: "Page display failed",
        },
      },
    },
  },
  react: { useSuspense: false },
})

function BrokenChild(): ReactNode {
  throw new Error("Simulated root render failure")
}

describe("RootErrorBoundary", () => {
  it("shows recovery guidance and reloads the page after a root render failure", async () => {
    const user = userEvent.setup()
    const reload = vi.fn()
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)

    try {
      loggerErrorMock.mockClear()
      render(
        <I18nextProvider i18n={i18n}>
          <RootErrorBoundary reloadPage={reload}>
            <BrokenChild />
          </RootErrorBoundary>
        </I18nextProvider>,
      )

      expect(
        screen.getByRole("heading", { name: "Page display failed" }),
      ).toBeVisible()
      expect(
        screen.getByText(
          "The page could not be displayed correctly. Reload first. If this keeps happening, turn off automatic translation for this page or switch to the language you need in extension settings.",
        ),
      ).toBeVisible()
      expect(
        screen.getByRole("link", { name: "Request a language" }),
      ).toHaveAttribute(
        "href",
        "https://github.com/qixing-jk/all-api-hub/issues/new?template=language_request.yml",
      )

      await user.click(screen.getByRole("button", { name: "Reload page" }))

      expect(reload).toHaveBeenCalledTimes(1)
      expect(loggerErrorMock).toHaveBeenCalledWith(
        "Root UI crashed",
        expect.objectContaining({
          componentStack: expect.any(Object),
          error: expect.any(Error),
        }),
      )
    } finally {
      consoleError.mockRestore()
    }
  })
})
