import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

type MatchMediaListener = (event: MediaQueryListEvent) => void

const { getPreferencesMock, loggerWarnMock } = vi.hoisted(() => ({
  getPreferencesMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}))

vi.mock("~/utils/i18n", () => ({}))
vi.mock("~/styles/style.css", () => ({}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: getPreferencesMock,
  },
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    warn: loggerWarnMock,
  }),
}))

vi.mock(
  "~/entrypoints/content/webAiApiCheck/components/ApiCheckModalHost",
  () => ({
    ApiCheckModalHost: () => (
      <input aria-label="API credential" data-testid="api-check-modal-host" />
    ),
  }),
)

vi.mock(
  "~/entrypoints/content/redemptionAssist/components/RedemptionToaster",
  () => ({
    RedemptionToaster: () => <div data-testid="redemption-toaster" />,
  }),
)

function createMatchMediaController(initialMatches = false) {
  let matches = initialMatches
  const listeners = new Set<MatchMediaListener>()

  return {
    queryList: {
      get matches() {
        return matches
      },
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addEventListener: vi.fn(
        (_event: string, listener: MatchMediaListener) => {
          listeners.add(listener)
        },
      ),
      removeEventListener: vi.fn(
        (_event: string, listener: MatchMediaListener) => {
          listeners.delete(listener)
        },
      ),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    },
    emit(nextMatches: boolean) {
      matches = nextMatches
      const event = { matches: nextMatches } as MediaQueryListEvent
      listeners.forEach((listener) => listener(event))
    },
  }
}

describe("ContentReactRoot", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
  })

  it("loads system theme preferences, reacts to color-scheme changes, and cleans up listeners", async () => {
    const media = createMatchMediaController(true)
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => media.queryList),
    )
    getPreferencesMock.mockResolvedValue({ themeMode: "system" })

    const { ContentReactRoot } = await import(
      "~/entrypoints/content/shared/ContentReactRoot"
    )

    const { container, unmount } = render(<ContentReactRoot />)

    expect(screen.getByTestId("api-check-modal-host")).toBeInTheDocument()
    expect(screen.getByTestId("redemption-toaster")).toBeInTheDocument()

    await waitFor(() => {
      expect(container.firstChild).toHaveClass(
        "dark",
        "text-foreground",
        "bg-background",
      )
    })

    act(() => {
      media.emit(false)
    })

    expect(container.firstChild).not.toHaveClass("dark")

    unmount()

    expect(media.queryList.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    )
  })

  it("applies an explicit dark theme from preferences and ignores later system changes", async () => {
    const media = createMatchMediaController(false)
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => media.queryList),
    )
    getPreferencesMock.mockResolvedValue({ themeMode: "dark" })

    const { ContentReactRoot } = await import(
      "~/entrypoints/content/shared/ContentReactRoot"
    )

    const { container } = render(<ContentReactRoot />)

    await waitFor(() => {
      expect(container.firstChild).toHaveClass(
        "dark",
        "text-foreground",
        "bg-background",
      )
    })

    act(() => {
      media.emit(false)
    })

    expect(container.firstChild).toHaveClass("dark")
    expect(media.queryList.addEventListener).not.toHaveBeenCalled()
    expect(media.queryList.removeEventListener).not.toHaveBeenCalled()
  })

  it("logs and keeps the default light wrapper when preferences fail to load", async () => {
    const media = createMatchMediaController(false)
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => media.queryList),
    )
    const error = new Error("prefs unavailable")
    getPreferencesMock.mockRejectedValue(error)

    const { ContentReactRoot } = await import(
      "~/entrypoints/content/shared/ContentReactRoot"
    )

    const { container } = render(<ContentReactRoot />)

    await waitFor(() => {
      expect(loggerWarnMock).toHaveBeenCalledWith(
        "Failed to load theme preferences",
        error,
      )
    })

    expect(container.firstChild).not.toHaveClass("dark")
  })

  it("stops content UI keyboard events from reaching host page shortcut listeners", async () => {
    const user = userEvent.setup()
    const media = createMatchMediaController(false)
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => media.queryList),
    )
    getPreferencesMock.mockResolvedValue({ themeMode: "light" })
    const hostPageKeyDown = vi.fn()
    const hostPageKeyUp = vi.fn()
    window.addEventListener("keydown", hostPageKeyDown)
    window.addEventListener("keyup", hostPageKeyUp)

    const { ContentReactRoot } = await import(
      "~/entrypoints/content/shared/ContentReactRoot"
    )

    render(<ContentReactRoot />)

    const input = screen.getByRole("textbox", {
      name: "API credential",
    }) as HTMLInputElement

    input.focus()
    await user.keyboard("a")

    expect(input.value).toBe("a")
    expect(hostPageKeyDown).not.toHaveBeenCalled()
    expect(hostPageKeyUp).not.toHaveBeenCalled()

    window.removeEventListener("keydown", hostPageKeyDown)
    window.removeEventListener("keyup", hostPageKeyUp)
  })
})
