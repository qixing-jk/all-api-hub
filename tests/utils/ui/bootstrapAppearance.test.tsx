import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  THEME_ATTRIBUTES,
  THEME_COLOR,
  THEME_MODE,
  THEME_OWNER,
  THEME_PRESET,
  THEME_RADIUS,
} from "~/constants/theme"
import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"
import { bootstrapAppearance } from "~/utils/ui/bootstrapAppearance"
import {
  applyThemePreferences,
  normalizeThemePreferences,
  THEME_BOOTSTRAP_CACHE_KEY,
} from "~/utils/ui/themePreferences"
import { createDeferred } from "~~/tests/test-utils/deferred"

const getStorage = vi.fn()

const key = USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES
const saved = {
  themeMode: THEME_MODE.DARK,
  appearance: {
    preset: THEME_PRESET.ANTHROPIC,
    color: THEME_COLOR.VIOLET,
    radius: THEME_RADIUS.LARGE,
  },
}

describe("popup appearance bootstrap", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    getStorage.mockReset()
    vi.stubGlobal("browser", { storage: { local: { get: getStorage } } })
    vi.stubGlobal("chrome", undefined)
    document.documentElement.classList.remove(THEME_MODE.DARK)
    document.documentElement.removeAttribute(THEME_ATTRIBUTES.OWNER)
    window.localStorage.removeItem(THEME_BOOTSTRAP_CACHE_KEY)
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("uses the cached palette synchronously while storage is pending", async () => {
    window.localStorage.setItem(
      THEME_BOOTSTRAP_CACHE_KEY,
      JSON.stringify(saved),
    )
    const pending = createDeferred<Record<string, unknown>>()
    getStorage.mockReturnValue(pending.promise)
    const ready = bootstrapAppearance()
    expect(document.documentElement).toHaveClass(THEME_MODE.DARK)
    expect(document.documentElement).toHaveAttribute(
      THEME_ATTRIBUTES.PRESET,
      THEME_PRESET.ANTHROPIC,
    )
    pending.resolve({ [key]: JSON.stringify({ themeMode: THEME_MODE.LIGHT }) })
    await ready
    expect(document.documentElement).not.toHaveClass(THEME_MODE.DARK)
    expect(document.documentElement).toHaveAttribute(
      THEME_ATTRIBUTES.PRESET,
      THEME_PRESET.DEFAULT,
    )
  })

  it.each([saved, JSON.stringify(saved)])(
    "reads stored object and Plasmo JSON records",
    async (stored) => {
      getStorage.mockResolvedValue({ [key]: stored })
      await bootstrapAppearance()
      expect(document.documentElement).toHaveClass(THEME_MODE.DARK)
      expect(document.documentElement).toHaveAttribute(
        THEME_ATTRIBUTES.PRESET,
        THEME_PRESET.ANTHROPIC,
      )
      expect(document.documentElement).toHaveAttribute(
        THEME_ATTRIBUTES.RADIUS,
        THEME_RADIUS.LARGE,
      )
      expect(
        JSON.parse(window.localStorage.getItem(THEME_BOOTSTRAP_CACHE_KEY)!),
      ).toEqual(saved)
    },
  )

  it("restores canonical preferences when only the Chrome storage API exists", async () => {
    vi.stubGlobal("browser", undefined)
    vi.stubGlobal("chrome", { storage: { local: { get: getStorage } } })
    getStorage.mockResolvedValue({ [key]: JSON.stringify(saved) })
    await bootstrapAppearance()
    expect(document.documentElement).toHaveClass(THEME_MODE.DARK)
    expect(document.documentElement).toHaveAttribute(
      THEME_ATTRIBUTES.PRESET,
      THEME_PRESET.ANTHROPIC,
    )
  })

  it("keeps the cached appearance if extension storage is unavailable", async () => {
    vi.stubGlobal("browser", undefined)
    window.localStorage.setItem(
      THEME_BOOTSTRAP_CACHE_KEY,
      JSON.stringify(saved),
    )
    await expect(bootstrapAppearance()).resolves.toBeUndefined()
    expect(document.documentElement).toHaveClass(THEME_MODE.DARK)
    expect(document.documentElement).toHaveAttribute(
      THEME_ATTRIBUTES.PRESET,
      THEME_PRESET.ANTHROPIC,
    )
  })

  it("does not let a delayed read replace a newer React preference update", async () => {
    const pending = createDeferred<Record<string, unknown>>()
    getStorage.mockReturnValue(pending.promise)
    const ready = bootstrapAppearance()
    const root = document.documentElement
    root.setAttribute(THEME_ATTRIBUTES.OWNER, THEME_OWNER.REACT)
    applyThemePreferences(
      root,
      normalizeThemePreferences({ themeMode: THEME_MODE.LIGHT }),
      false,
    )
    pending.resolve({ [key]: JSON.stringify(saved) })
    await ready
    expect(root).not.toHaveClass(THEME_MODE.DARK)
    expect(root).toHaveAttribute(THEME_ATTRIBUTES.PRESET, THEME_PRESET.DEFAULT)
  })

  it("keeps the cached palette when browser storage fails or contains malformed JSON", async () => {
    window.localStorage.setItem(
      THEME_BOOTSTRAP_CACHE_KEY,
      JSON.stringify(saved),
    )
    getStorage.mockRejectedValueOnce(new Error("storage unavailable"))
    await expect(bootstrapAppearance()).resolves.toBeUndefined()
    expect(document.documentElement).toHaveClass(THEME_MODE.DARK)
    getStorage.mockResolvedValueOnce({ [key]: "{invalid" })
    await expect(bootstrapAppearance()).resolves.toBeUndefined()
    expect(document.documentElement).toHaveAttribute(
      THEME_ATTRIBUTES.PRESET,
      THEME_PRESET.ANTHROPIC,
    )
  })

  it("ignores a corrupt cache and applies system mode for older preference records", async () => {
    window.localStorage.setItem(THEME_BOOTSTRAP_CACHE_KEY, "{invalid")
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    )
    getStorage.mockResolvedValue({
      [key]: JSON.stringify({ preferencesVersion: 1 }),
    })
    await bootstrapAppearance()
    expect(document.documentElement).toHaveClass(THEME_MODE.DARK)
    expect(document.documentElement).toHaveAttribute(
      THEME_ATTRIBUTES.COLOR,
      THEME_COLOR.BLUE,
    )
    expect(document.documentElement).toHaveAttribute(
      THEME_ATTRIBUTES.PRESET,
      THEME_PRESET.DEFAULT,
    )
  })

  it("still restores preferences if Web Storage access is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    getStorage.mockResolvedValue({ [key]: JSON.stringify(saved) })
    await expect(bootstrapAppearance()).resolves.toBeUndefined()
    expect(document.documentElement).toHaveAttribute(
      THEME_ATTRIBUTES.PRESET,
      THEME_PRESET.ANTHROPIC,
    )
  })

  it("normalizes unsupported choices independently without retaining other preferences", () => {
    expect(
      normalizeThemePreferences({
        themeMode: "unsupported",
        appearance: {
          preset: "unknown",
          color: THEME_COLOR.GREEN,
          radius: "unknown",
        },
        unrelated: "not part of the cache",
      }),
    ).toEqual({
      themeMode: "system",
      appearance: { preset: "default", color: "green", radius: "default" },
    })
  })
})
