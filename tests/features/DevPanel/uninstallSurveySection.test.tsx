import { fireEvent, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUninstallSurveyDevSection } from "~/features/DevPanel/sections/uninstallSurveySection"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { renderDevPanelSection } from "~~/tests/test-utils/devPanelSection"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const {
  composeUrlMock,
  registerNowMock,
  clearMock,
  windowOpenMock,
  toastSuccessMock,
  REMOTE_SURVEY_PAGE_URL,
  LOCAL_SURVEY_PAGE_URL,
  TARGET_STORAGE_KEY,
} = vi.hoisted(() => ({
  composeUrlMock: vi.fn(),
  registerNowMock: vi.fn(),
  clearMock: vi.fn(),
  windowOpenMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  REMOTE_SURVEY_PAGE_URL: "https://all-api-hub.qixing1217.top/uninstall.html",
  LOCAL_SURVEY_PAGE_URL: "http://localhost:8080/uninstall.html",
  TARGET_STORAGE_KEY: "aah-dev:uninstall-survey-target",
}))

vi.mock("~/services/uninstallSurvey/uninstallSurvey", () => ({
  resolveSurveyPageUrl: () => REMOTE_SURVEY_PAGE_URL,
  uninstallSurveyService: {
    composeUrl: composeUrlMock,
    registerNow: registerNowMock,
    clear: clearMock,
  },
}))

vi.mock("~/lib/notify", () => {
  const toastMock = Object.assign(vi.fn(), {
    dismiss: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(() => "toast-id"),
    success: toastSuccessMock,
  })
  return { default: toastMock }
})

const COMPOSED_URL = `${REMOTE_SURVEY_PAGE_URL}?uid=analytics-abc&v=1.2.3&d=3&lang=zh-CN`

describe("uninstall survey dev section", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    vi.spyOn(window, "open").mockImplementation(windowOpenMock)
    composeUrlMock.mockResolvedValue(COMPOSED_URL)
    registerNowMock.mockResolvedValue(COMPOSED_URL)
    clearMock.mockResolvedValue(true)
  })

  it("composes a preview without registering", async () => {
    renderDevPanelSection(useUninstallSurveyDevSection)

    fireEvent.click(
      screen.getByRole("button", { name: "Dev: Compose URL preview" }),
    )

    await waitFor(() => {
      expect(screen.getByTestId("row-composed-url")).toHaveTextContent(
        COMPOSED_URL,
      )
    })
    expect(composeUrlMock).toHaveBeenCalledTimes(1)
    expect(registerNowMock).not.toHaveBeenCalled()
  })

  it("registers the URL and shows the registered value", async () => {
    renderDevPanelSection(useUninstallSurveyDevSection)

    fireEvent.click(
      screen.getByRole("button", { name: "Dev: Register uninstall URL" }),
    )

    await waitFor(() => {
      expect(screen.getByTestId("row-composed-url")).toHaveTextContent(
        COMPOSED_URL,
      )
    })
    expect(registerNowMock).toHaveBeenCalledTimes(1)
  })

  it("opens the survey page without the anonymous id", async () => {
    renderDevPanelSection(useUninstallSurveyDevSection)

    fireEvent.click(
      screen.getByRole("button", { name: "Dev: Open survey page (no uid)" }),
    )

    await waitFor(() => {
      expect(windowOpenMock).toHaveBeenCalledTimes(1)
    })
    const opened = new URL(atIndex(windowOpenMock.mock.calls, 0)[0])
    expect(opened.searchParams.has("uid")).toBe(false)
    expect(opened.searchParams.get("v")).toBe("1.2.3")
    expect(opened.searchParams.get("lang")).toBe("zh-CN")
  })

  it("clears the registered uninstall URL", async () => {
    renderDevPanelSection(useUninstallSurveyDevSection)

    fireEvent.click(
      screen.getByRole("button", { name: "Dev: Clear uninstall URL" }),
    )

    await waitFor(() => {
      expect(clearMock).toHaveBeenCalledTimes(1)
    })
  })

  it("targets the deployed page by default", async () => {
    renderDevPanelSection(useUninstallSurveyDevSection)

    expect(screen.getByTestId("row-survey-target")).toHaveTextContent(
      REMOTE_SURVEY_PAGE_URL,
    )

    fireEvent.click(
      screen.getByRole("button", { name: "Dev: Register uninstall URL" }),
    )

    await waitFor(() => {
      expect(registerNowMock).toHaveBeenCalledWith({
        baseUrl: REMOTE_SURVEY_PAGE_URL,
      })
    })
  })

  it("switches to the local dev server target and registers against it", async () => {
    renderDevPanelSection(useUninstallSurveyDevSection)

    fireEvent.click(
      screen.getByRole("button", { name: "Dev: Switch target to local" }),
    )

    await waitFor(() => {
      expect(screen.getByTestId("row-survey-target")).toHaveTextContent(
        LOCAL_SURVEY_PAGE_URL,
      )
    })
    expect(window.localStorage.getItem(TARGET_STORAGE_KEY)).toBe("local")

    fireEvent.click(
      screen.getByRole("button", { name: "Dev: Register uninstall URL" }),
    )

    await waitFor(() => {
      expect(registerNowMock).toHaveBeenCalledWith({
        baseUrl: LOCAL_SURVEY_PAGE_URL,
      })
    })
  })

  it("restores the stored target and offers to switch back", async () => {
    window.localStorage.setItem(TARGET_STORAGE_KEY, "local")

    renderDevPanelSection(useUninstallSurveyDevSection)

    expect(screen.getByTestId("row-survey-target")).toHaveTextContent(
      LOCAL_SURVEY_PAGE_URL,
    )
    expect(
      screen.getByRole("button", { name: "Dev: Switch target to remote" }),
    ).toBeInTheDocument()
  })

  it("reports a target switch once under StrictMode double invocation", async () => {
    renderDevPanelSection(useUninstallSurveyDevSection, { strict: true })

    fireEvent.click(
      screen.getByRole("button", { name: "Dev: Switch target to local" }),
    )

    await waitFor(() => {
      expect(screen.getByTestId("row-survey-target")).toHaveTextContent(
        LOCAL_SURVEY_PAGE_URL,
      )
    })
    // Side effects belong outside the state updater, which React may re-run.
    expect(toastSuccessMock).toHaveBeenCalledTimes(1)
  })

  it("marks only the action that is running as loading", async () => {
    const preview = createDeferred<string | null>()
    composeUrlMock.mockReturnValue(preview.promise)

    renderDevPanelSection(useUninstallSurveyDevSection)

    fireEvent.click(
      screen.getByRole("button", { name: "Dev: Compose URL preview" }),
    )

    const compose = screen.getByRole("button", {
      name: "Dev: Compose URL preview",
    })
    const register = screen.getByRole("button", {
      name: "Dev: Register uninstall URL",
    })
    expect(compose).toHaveAttribute("aria-busy", "true")
    expect(register).not.toHaveAttribute("aria-busy")
    // Siblings stay blocked while one action is running.
    expect(register).toBeDisabled()

    preview.resolve(COMPOSED_URL)

    await waitFor(() => expect(compose).not.toHaveAttribute("aria-busy"))
    expect(register).toBeEnabled()
  })
})
