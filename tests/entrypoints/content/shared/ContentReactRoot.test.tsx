import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  THEME_ATTRIBUTES,
  THEME_COLOR,
  THEME_MODE,
  THEME_PRESET,
  THEME_RADIUS,
} from "~/constants/theme"
import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"
import type { UserPreferences } from "~/services/preferences/userPreferences"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { createMatchMediaController } from "~~/tests/test-utils/matchMedia"

const { getPreferencesMock, loggerWarnMock, watchMock, unwatchMock } =
  vi.hoisted(() => ({
    getPreferencesMock: vi.fn(),
    loggerWarnMock: vi.fn(),
    watchMock: vi.fn(),
    unwatchMock: vi.fn(),
  }))

vi.mock("@plasmohq/storage", () => ({
  Storage: class {
    watch = watchMock
    unwatch = unwatchMock
  },
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

describe("ContentReactRoot", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
  })

  it("applies live accent preferences inside its scope without modifying the host document", async () => {
    getPreferencesMock.mockResolvedValue({
      themeMode: THEME_MODE.LIGHT,
      appearance: { color: THEME_COLOR.ROSE },
    })
    const { ContentReactRoot } = await import(
      "~/entrypoints/content/shared/ContentReactRoot"
    )
    const originalHostTheme = document.documentElement.getAttribute(
      THEME_ATTRIBUTES.COLOR,
    )
    const { container, unmount } = render(<ContentReactRoot />)
    await waitFor(() =>
      expect(container.firstChild).toHaveAttribute(
        THEME_ATTRIBUTES.COLOR,
        THEME_COLOR.ROSE,
      ),
    )
    getPreferencesMock.mockResolvedValue({
      themeMode: THEME_MODE.DARK,
      appearance: { color: THEME_COLOR.GREEN, preset: THEME_PRESET.ANTHROPIC },
    })
    act(() => {
      watchMock.mock.calls[0][0][
        USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES
      ]()
    })
    await waitFor(() =>
      expect(container.firstChild).toHaveAttribute(
        THEME_ATTRIBUTES.COLOR,
        THEME_COLOR.GREEN,
      ),
    )
    expect(container.firstChild).toHaveClass(THEME_MODE.DARK)
    expect(container.firstChild).toHaveAttribute(THEME_ATTRIBUTES.COLOR_SCOPE)
    expect(container.firstChild).toHaveAttribute(
      THEME_ATTRIBUTES.PRESET,
      THEME_PRESET.ANTHROPIC,
    )
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTES.COLOR)).toBe(
      originalHostTheme,
    )
    unmount()
    expect(unwatchMock).toHaveBeenCalledWith(watchMock.mock.calls[0][0])
  })

  it("discards a stale initial read after a storage update has loaded", async () => {
    const media = createMatchMediaController(false)
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => media.queryList),
    )
    const initial = createDeferred<Partial<UserPreferences>>()
    getPreferencesMock.mockReturnValueOnce(initial.promise).mockResolvedValue({
      themeMode: THEME_MODE.DARK,
      appearance: { color: THEME_COLOR.GREEN },
    })
    const { ContentReactRoot } = await import(
      "~/entrypoints/content/shared/ContentReactRoot"
    )
    const { container } = render(<ContentReactRoot />)

    act(() => {
      watchMock.mock.calls[0][0][
        USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES
      ]()
    })
    await waitFor(() =>
      expect(container.firstChild).toHaveAttribute(
        THEME_ATTRIBUTES.COLOR,
        THEME_COLOR.GREEN,
      ),
    )
    await act(async () => {
      initial.resolve({
        themeMode: THEME_MODE.SYSTEM,
        appearance: {
          preset: THEME_PRESET.DEFAULT,
          color: THEME_COLOR.ROSE,
          radius: THEME_RADIUS.SMALL,
        },
      })
      await initial.promise
    })

    expect(container.firstChild).toHaveClass(THEME_MODE.DARK)
    expect(container.firstChild).toHaveAttribute(
      THEME_ATTRIBUTES.COLOR,
      THEME_COLOR.GREEN,
    )
    expect(media.queryList.addEventListener).not.toHaveBeenCalled()
  })

  it("does not subscribe to system changes when a read finishes after unmount", async () => {
    const media = createMatchMediaController(true)
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => media.queryList),
    )
    const pending = createDeferred<Partial<UserPreferences>>()
    getPreferencesMock.mockReturnValueOnce(pending.promise)
    const { ContentReactRoot } = await import(
      "~/entrypoints/content/shared/ContentReactRoot"
    )
    const { unmount } = render(<ContentReactRoot />)
    unmount()
    await act(async () => {
      pending.resolve({ themeMode: THEME_MODE.SYSTEM })
      await pending.promise
    })

    expect(unwatchMock).toHaveBeenCalledWith(watchMock.mock.calls[0][0])
    expect(media.queryList.addEventListener).not.toHaveBeenCalled()
  })

  it("loads system theme preferences, reacts to color-scheme changes, and cleans up listeners", async () => {
    const media = createMatchMediaController(true)
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => media.queryList),
    )
    getPreferencesMock.mockResolvedValue({ themeMode: THEME_MODE.SYSTEM })

    const { ContentReactRoot } = await import(
      "~/entrypoints/content/shared/ContentReactRoot"
    )

    const { container, unmount } = render(<ContentReactRoot />)

    expect(screen.getByTestId("api-check-modal-host")).toBeInTheDocument()
    expect(screen.getByTestId("redemption-toaster")).toBeInTheDocument()

    await waitFor(() => {
      expect(container.firstChild).toHaveClass(
        THEME_MODE.DARK,
        "text-foreground",
        "bg-background",
      )
    })

    act(() => {
      media.emit(false)
    })

    expect(container.firstChild).not.toHaveClass(THEME_MODE.DARK)

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
    getPreferencesMock.mockResolvedValue({ themeMode: THEME_MODE.DARK })

    const { ContentReactRoot } = await import(
      "~/entrypoints/content/shared/ContentReactRoot"
    )

    const { container } = render(<ContentReactRoot />)

    await waitFor(() => {
      expect(container.firstChild).toHaveClass(
        THEME_MODE.DARK,
        "text-foreground",
        "bg-background",
      )
    })

    act(() => {
      media.emit(false)
    })

    expect(container.firstChild).toHaveClass(THEME_MODE.DARK)
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

    expect(container.firstChild).not.toHaveClass(THEME_MODE.DARK)
  })

  it("stops content UI keyboard events from reaching host page shortcut listeners", async () => {
    const user = userEvent.setup()
    const media = createMatchMediaController(false)
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => media.queryList),
    )
    getPreferencesMock.mockResolvedValue({ themeMode: THEME_MODE.LIGHT })
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
