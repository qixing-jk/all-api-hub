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
          genericDescription:
            "The page could not be displayed correctly. Reload first. If this keeps happening, report the problem so we can help.",
          reportIssue: "Report problem",
          reload: "Reload page",
          requestLanguage: "Request a language",
          title: "Page display failed",
          translationDescription:
            "If you are using automatic translation, turn it off for this page or switch to the language you need in extension settings.",
        },
      },
    },
  },
  react: { useSuspense: false },
})

function BrokenChild(): ReactNode {
  throw new Error("Simulated root render failure")
}

function BrokenTranslatedDomChild(): ReactNode {
  throw new DOMException(
    "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
    "NotFoundError",
  )
}

describe("RootErrorBoundary", () => {
  it("uses the browser reload function when no custom reload handler is provided", async () => {
    const user = userEvent.setup()
    const reload = vi.fn()
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)

    const originalLocation = window.location
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        reload,
      },
    })

    try {
      loggerErrorMock.mockClear()
      render(
        <I18nextProvider i18n={i18n}>
          <RootErrorBoundary>
            <BrokenChild />
          </RootErrorBoundary>
        </I18nextProvider>,
      )

      await user.click(screen.getByRole("button", { name: "Reload page" }))

      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
      })
      consoleError.mockRestore()
    }
  })

  it("shows generic recovery guidance and reloads the page after a root render failure", async () => {
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
          "The page could not be displayed correctly. Reload first. If this keeps happening, report the problem so we can help.",
        ),
      ).toBeVisible()
      expect(
        screen.queryByText(
          "If you are using automatic translation, turn it off for this page or switch to the language you need in extension settings.",
        ),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole("link", { name: "Request a language" }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole("link", { name: "Report problem" }),
      ).toHaveAttribute(
        "href",
        "https://github.com/qixing-jk/all-api-hub/issues/new?template=bug_report.yml",
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

  it("shows translation guidance only for DOM mutation style root failures", async () => {
    const reload = vi.fn()
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)

    try {
      loggerErrorMock.mockClear()
      render(
        <I18nextProvider i18n={i18n}>
          <RootErrorBoundary reloadPage={reload}>
            <BrokenTranslatedDomChild />
          </RootErrorBoundary>
        </I18nextProvider>,
      )

      expect(
        screen.getByText(
          "The page could not be displayed correctly. Reload first. If this keeps happening, report the problem so we can help.",
        ),
      ).toBeVisible()
      expect(
        screen.getByText(
          "If you are using automatic translation, turn it off for this page or switch to the language you need in extension settings.",
        ),
      ).toBeVisible()
      expect(
        screen.getByRole("link", { name: "Request a language" }),
      ).toHaveAttribute(
        "href",
        "https://github.com/qixing-jk/all-api-hub/issues/new?template=language_request.yml",
      )
    } finally {
      consoleError.mockRestore()
    }
  })
})
