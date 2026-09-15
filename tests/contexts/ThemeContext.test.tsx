import { act, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  THEME_ATTRIBUTES,
  THEME_COLOR,
  THEME_MODE,
  THEME_OWNER,
  THEME_PRESET,
  THEME_RADIUS,
} from "~/constants/theme"
import { ThemeProvider, useTheme } from "~/contexts/ThemeContext"
import type { AppearancePreferences, ThemeMode } from "~/types/theme"
import { THEME_BOOTSTRAP_CACHE_KEY } from "~/utils/ui/themePreferences"
import { createMatchMediaController } from "~~/tests/test-utils/matchMedia"

const { updateThemeModeMock } = vi.hoisted(() => ({
  updateThemeModeMock: vi.fn(),
}))

const mockPreferencesContext = {
  current: {
    themeMode: THEME_MODE.SYSTEM as ThemeMode,
    updateThemeMode: updateThemeModeMock,
    isLoading: false,
    preferences: undefined as
      | { appearance?: AppearancePreferences }
      | undefined,
  },
}

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => mockPreferencesContext.current,
}))

const TEST_IDS = {
  themeMode: "theme-mode",
  resolvedTheme: "resolved-theme",
} as const

const Probe = ({ children }: { children?: ReactNode }) => {
  const context = useTheme()

  return (
    <div>
      <div data-testid={TEST_IDS.themeMode}>{context.themeMode}</div>
      <div data-testid={TEST_IDS.resolvedTheme}>{context.resolvedTheme}</div>
      <button onClick={() => context.setThemeMode(THEME_MODE.DARK)}>
        set-dark
      </button>
      {children}
    </div>
  )
}

describe("ThemeContext", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.documentElement.classList.remove(THEME_MODE.DARK)
    document.documentElement.removeAttribute(THEME_ATTRIBUTES.OWNER)
    window.localStorage.removeItem(THEME_BOOTSTRAP_CACHE_KEY)
    mockPreferencesContext.current = {
      themeMode: THEME_MODE.SYSTEM,
      updateThemeMode: updateThemeModeMock,
      isLoading: false,
      preferences: undefined,
    }
  })

  it("preserves the startup palette until authoritative preferences load", () => {
    const media = createMatchMediaController(false)
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => media.queryList),
    )
    const root = document.documentElement
    root.classList.add(THEME_MODE.DARK)
    root.setAttribute(THEME_ATTRIBUTES.PRESET, THEME_PRESET.ANTHROPIC)
    root.setAttribute(THEME_ATTRIBUTES.OWNER, THEME_OWNER.BOOTSTRAP)
    window.localStorage.setItem(THEME_BOOTSTRAP_CACHE_KEY, "cached-theme")
    mockPreferencesContext.current.isLoading = true

    const { rerender } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId(TEST_IDS.resolvedTheme)).toHaveTextContent(
      THEME_MODE.DARK,
    )
    expect(root).toHaveClass(THEME_MODE.DARK)
    expect(root).toHaveAttribute(
      THEME_ATTRIBUTES.PRESET,
      THEME_PRESET.ANTHROPIC,
    )
    expect(window.localStorage.getItem(THEME_BOOTSTRAP_CACHE_KEY)).toBe(
      "cached-theme",
    )

    mockPreferencesContext.current = {
      ...mockPreferencesContext.current,
      isLoading: false,
      themeMode: THEME_MODE.LIGHT,
      preferences: {
        appearance: {
          preset: THEME_PRESET.DEFAULT,
          color: THEME_COLOR.ROSE,
          radius: THEME_RADIUS.SMALL,
          density: "default",
        },
      },
    }
    rerender(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(root).not.toHaveClass(THEME_MODE.DARK)
    expect(root).toHaveAttribute(THEME_ATTRIBUTES.COLOR, THEME_COLOR.ROSE)
    expect(root).toHaveAttribute(THEME_ATTRIBUTES.PRESET, THEME_PRESET.DEFAULT)
    expect(root).toHaveAttribute(THEME_ATTRIBUTES.OWNER, THEME_OWNER.REACT)
    expect(
      JSON.parse(window.localStorage.getItem(THEME_BOOTSTRAP_CACHE_KEY)!),
    ).toEqual({
      themeMode: "light",
      appearance: {
        preset: "default",
        color: "rose",
        radius: "small",
        density: "default",
      },
    })
  })

  it("throws when useTheme is used outside the provider", () => {
    const BrokenConsumer = () => {
      useTheme()
      return null
    }

    expect(() => render(<BrokenConsumer />)).toThrow(
      "useTheme must be used within a ThemeProvider",
    )
  })

  it("uses the system dark preference, reacts to media-query changes, and cleans up listeners", () => {
    const media = createMatchMediaController(true)
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => media.queryList),
    )

    const { unmount } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    expect(screen.getByTestId(TEST_IDS.themeMode)).toHaveTextContent(
      THEME_MODE.SYSTEM,
    )
    expect(screen.getByTestId(TEST_IDS.resolvedTheme)).toHaveTextContent(
      THEME_MODE.DARK,
    )
    expect(document.documentElement.classList.contains(THEME_MODE.DARK)).toBe(
      true,
    )

    act(() => {
      media.emit(false)
    })

    expect(screen.getByTestId(TEST_IDS.resolvedTheme)).toHaveTextContent(
      THEME_MODE.LIGHT,
    )
    expect(document.documentElement.classList.contains(THEME_MODE.DARK)).toBe(
      false,
    )

    unmount()

    expect(media.queryList.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    )
  })

  it("uses the system light preference initially and switches to dark when the media query changes", () => {
    const media = createMatchMediaController(false)
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => media.queryList),
    )

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    expect(screen.getByTestId(TEST_IDS.resolvedTheme)).toHaveTextContent(
      THEME_MODE.LIGHT,
    )
    expect(document.documentElement.classList.contains(THEME_MODE.DARK)).toBe(
      false,
    )

    act(() => {
      media.emit(true)
    })

    expect(screen.getByTestId(TEST_IDS.resolvedTheme)).toHaveTextContent(
      THEME_MODE.DARK,
    )
    expect(document.documentElement.classList.contains(THEME_MODE.DARK)).toBe(
      true,
    )
  })

  it("uses explicit theme modes and delegates updates through the preferences context", async () => {
    const media = createMatchMediaController(false)
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => media.queryList),
    )
    mockPreferencesContext.current.themeMode = THEME_MODE.LIGHT
    updateThemeModeMock.mockResolvedValue(undefined)

    const { rerender } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    expect(screen.getByTestId(TEST_IDS.resolvedTheme)).toHaveTextContent(
      THEME_MODE.LIGHT,
    )
    expect(document.documentElement.classList.contains(THEME_MODE.DARK)).toBe(
      false,
    )

    await act(async () => {
      screen.getByRole("button", { name: "set-dark" }).click()
    })

    expect(updateThemeModeMock).toHaveBeenCalledWith(THEME_MODE.DARK)

    mockPreferencesContext.current.themeMode = THEME_MODE.DARK
    rerender(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    expect(screen.getByTestId(TEST_IDS.resolvedTheme)).toHaveTextContent(
      THEME_MODE.DARK,
    )
    expect(document.documentElement.classList.contains(THEME_MODE.DARK)).toBe(
      true,
    )
  })

  it("ignores system color-scheme change events when the user selected an explicit theme", () => {
    const media = createMatchMediaController(true)
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => media.queryList),
    )
    mockPreferencesContext.current.themeMode = THEME_MODE.DARK

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    expect(screen.getByTestId(TEST_IDS.resolvedTheme)).toHaveTextContent(
      THEME_MODE.DARK,
    )

    act(() => {
      media.emit(false)
    })

    expect(screen.getByTestId(TEST_IDS.resolvedTheme)).toHaveTextContent(
      THEME_MODE.DARK,
    )
    expect(document.documentElement.classList.contains(THEME_MODE.DARK)).toBe(
      true,
    )
  })
})
