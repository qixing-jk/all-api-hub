import { act, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { BASIC_SETTINGS_ANCHOR_TO_TAB } from "~/constants/basicSettingsTabs"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import {
  THEME_COLOR,
  THEME_CONTENT_WIDTH,
  THEME_MODE,
  THEME_PRESET,
  THEME_RADIUS,
} from "~/constants/theme"
import { AppearanceControls } from "~/features/Appearance/AppearanceControls"
import { AppearanceDrawer } from "~/features/Appearance/AppearanceDrawer"
import { generalSearchControls } from "~/features/BasicSettings/components/tabs/General/General.search"
import { normalizeAppearance } from "~/types/theme"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { atIndex } from "~~/tests/test-utils/indexedAccess"
import { render } from "~~/tests/test-utils/render"

const { save, savedAppearance } = vi.hoisted(() => ({
  save: vi.fn(),
  savedAppearance: {
    contentWidth: "centered",
    sidebarCollapsed: false,
    preset: "default",
    density: "default",
    textSize: "default",
    fontFamily: "default",
    color: "blue",
    radius: "default",
    themeMode: "system",
  },
}))
vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => ({
    preferences: {
      appearance: {
        ...savedAppearance,
      },
    },
    themeMode: savedAppearance.themeMode,
    updateAppearance: save,
  }),
}))

const renderControls = () =>
  render(<AppearanceControls showMode anchors />, {
    withUserPreferencesProvider: false,
    withThemeProvider: false,
  })

describe("appearance controls", () => {
  it("selects and resets font independently from the theme, density and text size", async () => {
    const user = userEvent.setup()
    savedAppearance.preset = "anthropic"
    savedAppearance.density = "compact"
    savedAppearance.textSize = "extra-large"
    renderControls()
    const group = screen.getByRole("group", {
      name: "settings:appearance.font",
    })
    expect(
      within(group).getByRole("radio", {
        name: "settings:appearance.fonts.default",
      }),
    ).toBeChecked()
    for (const font of ["sans", "serif"]) {
      await user.click(
        within(group).getByRole("radio", {
          name: `settings:appearance.fonts.${font}`,
        }),
      )
      expect(save).toHaveBeenLastCalledWith({ fontFamily: font })
    }
    await user.click(within(group).getByRole("button"))
    expect(save).toHaveBeenLastCalledWith({ fontFamily: "default" })
    expect(savedAppearance).toMatchObject({
      preset: "anthropic",
      density: "compact",
      textSize: "extra-large",
    })
  })

  it("changes content width and restores centered layout independently", async () => {
    const user = userEvent.setup()
    renderControls()
    const group = screen.getByRole("group", {
      name: "settings:appearance.contentWidth",
    })
    expect(
      within(group).getByRole("radio", {
        name: "settings:appearance.contentWidths.centered",
      }),
    ).toBeChecked()
    await user.click(
      within(group).getByRole("radio", {
        name: "settings:appearance.contentWidths.full",
      }),
    )
    expect(save).toHaveBeenLastCalledWith({ contentWidth: "full" })
    await user.click(within(group).getByRole("button"))
    expect(save).toHaveBeenLastCalledWith({ contentWidth: "centered" })
  })

  beforeEach(() => {
    save.mockReset()
    save.mockImplementation(async (updates) => {
      Object.assign(savedAppearance, updates)
      return { ok: true }
    })
    savedAppearance.contentWidth = THEME_CONTENT_WIDTH.CENTERED
    savedAppearance.sidebarCollapsed = false
    savedAppearance.preset = THEME_PRESET.DEFAULT
    savedAppearance.density = "default"
    savedAppearance.textSize = "default"
    savedAppearance.fontFamily = "default"
    savedAppearance.color = "blue"
    savedAppearance.radius = "default"
    savedAppearance.themeMode = "system"
  })

  it("hides field resets at defaults while keeping the group reset disabled", () => {
    renderControls()
    for (const group of screen.getAllByRole("group")) {
      expect(within(group).queryByRole("button")).not.toBeInTheDocument()
    }
    expect(
      screen.getByRole("button", { name: "settings:appearance.reset" }),
    ).toBeDisabled()
  })

  it.each([
    ["theme.mode", { themeMode: THEME_MODE.SYSTEM }],
    ["appearance.preset", { preset: THEME_PRESET.DEFAULT }],
    ["appearance.color", { color: THEME_COLOR.BLUE }],
    ["appearance.radius", { radius: THEME_RADIUS.DEFAULT }],
    ["appearance.density", { density: "default" }],
    ["appearance.textSize", { textSize: "default" }],
    ["appearance.font", { fontFamily: "default" }],
  ])("resets only the field in %s", async (label, expected) => {
    const user = userEvent.setup()
    Object.assign(savedAppearance, {
      preset: "anthropic",
      color: "rose",
      radius: "large",
      density: "compact",
      textSize: "large",
      fontFamily: "serif",
      themeMode: "dark",
    })
    renderControls()
    const group = screen.getByRole("group", { name: `settings:${label}` })
    await user.click(within(group).getByRole("button"))
    expect(save).toHaveBeenCalledExactlyOnceWith(expected)
  })

  it("saves a selected light or dark mode without resetting appearance", async () => {
    const user = userEvent.setup()
    renderControls()

    expect(
      screen.getByRole("radio", { name: "settings:theme.followSystem" }),
    ).toBeChecked()
    await user.click(screen.getByRole("radio", { name: "settings:theme.dark" }))
    expect(save).toHaveBeenLastCalledWith({ themeMode: THEME_MODE.DARK })
    await user.click(
      screen.getByRole("radio", { name: "settings:theme.light" }),
    )
    expect(save).toHaveBeenLastCalledWith({ themeMode: THEME_MODE.LIGHT })
  })

  it("keeps concise three-choice settings in a compact three-column group", () => {
    const { container } = renderControls()

    expect(container.firstElementChild).not.toHaveClass(
      "[container-type:inline-size]",
    )
    for (const name of [
      "settings:theme.mode",
      "settings:appearance.density",
      "settings:appearance.textSize",
    ]) {
      const group = screen.getByRole("group", { name })
      const firstChoice = atIndex(within(group).getAllByRole("radio"), 0)
      expect(firstChoice.parentElement?.parentElement).toHaveClass(
        "grid-cols-3",
      )
    }
  })

  it("explains preset-owned colors and restores accent choices after returning to the default preset", async () => {
    const user = userEvent.setup()
    savedAppearance.preset = THEME_PRESET.ANTHROPIC
    const { rerender } = renderControls()

    expect(
      screen.getByRole("radio", {
        name: "settings:appearance.presets.anthropic",
      }),
    ).toBeChecked()
    expect(
      screen.getByText("settings:appearance.presetColorsHint"),
    ).toBeVisible()
    expect(
      screen.queryByRole("radio", { name: "settings:appearance.colors.blue" }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("radio", {
        name: "settings:appearance.presets.default",
      }),
    )
    expect(save).toHaveBeenLastCalledWith({ preset: THEME_PRESET.DEFAULT })
    savedAppearance.preset = THEME_PRESET.DEFAULT
    rerender(<AppearanceControls showMode anchors />)

    expect(
      screen.getByRole("radio", { name: "settings:appearance.colors.blue" }),
    ).toBeChecked()
    expect(
      screen.queryByText("settings:appearance.presetColorsHint"),
    ).not.toBeInTheDocument()
  })

  it("changes and independently resets density without changing other appearance fields", async () => {
    const user = userEvent.setup()
    renderControls()
    expect(
      screen.getByRole("radio", {
        name: "settings:appearance.densities.default",
      }),
    ).toBeChecked()
    for (const density of ["compact", "comfortable"]) {
      await user.click(
        screen.getByRole("radio", {
          name: `settings:appearance.densities.${density}`,
        }),
      )
      expect(save).toHaveBeenLastCalledWith({ density })
    }
    await user.click(
      screen.getByRole("button", { name: "settings:appearance.resetDensity" }),
    )
    expect(save).toHaveBeenLastCalledWith({ density: "default" })
    expect(
      normalizeAppearance({ density: "invalid", color: "rose" }),
    ).toMatchObject({ density: "default", color: "rose" })
    expect(normalizeAppearance({ density: "compact" }).density).toBe("compact")
  })

  it("keeps searchable appearance controls linked to visible settings groups", () => {
    renderControls()
    expect(
      generalSearchControls.find(
        (item) => item.targetId === SETTINGS_ANCHORS.APPEARANCE_THEME_MODE,
      )?.titleKey,
    ).toBe("settings:theme.mode")
    for (const targetId of [
      SETTINGS_ANCHORS.APPEARANCE_PRESET,
      SETTINGS_ANCHORS.APPEARANCE_COLOR,
      SETTINGS_ANCHORS.APPEARANCE_RADIUS,
      SETTINGS_ANCHORS.APPEARANCE_DENSITY,
      SETTINGS_ANCHORS.APPEARANCE_TEXT_SIZE,
      SETTINGS_ANCHORS.APPEARANCE_FONT,
      SETTINGS_ANCHORS.APPEARANCE_CONTENT_WIDTH,
    ]) {
      const definition = generalSearchControls.find(
        (item) => item.targetId === targetId,
      )!
      expect(definition.tabId).toBe(BASIC_SETTINGS_ANCHOR_TO_TAB[targetId])
      expect(
        screen.getByRole("group", { name: definition.titleKey }),
      ).toHaveAttribute("id", targetId)
    }
  })

  it("saves and resets text size independently from compact density", async () => {
    const user = userEvent.setup()
    savedAppearance.density = "compact"
    renderControls()
    const group = screen.getByRole("group", {
      name: "settings:appearance.textSize",
    })
    expect(
      within(group).getByRole("radio", {
        name: "settings:appearance.textSizes.default",
      }),
    ).toBeChecked()
    for (const [label, textSize] of [
      ["large", "large"],
      ["extraLarge", "extra-large"],
    ]) {
      await user.click(
        within(group).getByRole("radio", {
          name: `settings:appearance.textSizes.${label}`,
        }),
      )
      expect(save).toHaveBeenLastCalledWith({ textSize })
      expect(
        screen.getByRole("radio", {
          name: "settings:appearance.densities.compact",
        }),
      ).toBeChecked()
    }
    await user.click(
      within(group).getByRole("button", {
        name: "settings:appearance.resetTextSize",
      }),
    )
    expect(save).toHaveBeenLastCalledWith({ textSize: "default" })
  })

  it.each([undefined, null, "unknown", 2, {}])(
    "defaults an invalid text size %j without resetting density",
    (textSize) => {
      expect(
        normalizeAppearance({
          textSize,
          density: "compact",
          preset: "anthropic",
        }),
      ).toMatchObject({
        textSize: "default",
        fontFamily: "default",
        density: "compact",
        preset: "anthropic",
      })
    },
  )

  it("keeps the saved text size after a failed save and allows retry", async () => {
    const user = userEvent.setup()
    save.mockResolvedValueOnce({ ok: false })
    renderControls()
    const larger = screen.getByRole("radio", {
      name: "settings:appearance.textSizes.extraLarge",
    })
    await user.click(larger)
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "settings:appearance.saveFailed",
    )
    expect(
      screen.getByRole("radio", {
        name: "settings:appearance.textSizes.default",
      }),
    ).toBeChecked()
    await user.click(larger)
    expect(save).toHaveBeenLastCalledWith({ textSize: "extra-large" })
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("keeps the drawer focused on its choices", () => {
    render(<AppearanceDrawer open onOpenChange={() => {}} />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    const drawer = screen.getByRole("dialog")
    expect(
      within(drawer).getByRole("group", {
        name: "settings:appearance.textSize",
      }),
    ).toBeVisible()
  })

  it("normalizes missing and unsupported backup values independently", () => {
    expect(normalizeAppearance(undefined)).toEqual({
      contentWidth: "centered",
      sidebarCollapsed: false,
      preset: "default",
      color: "blue",
      radius: "default",
      density: "default",
      textSize: "default",
      fontFamily: "default",
    })
    expect(
      normalizeAppearance({ color: "custom", radius: THEME_RADIUS.SMALL }),
    ).toEqual({
      contentWidth: "centered",
      sidebarCollapsed: false,
      preset: "default",
      color: "blue",
      radius: "small",
      density: "default",
      textSize: "default",
      fontFamily: "default",
    })
    expect(
      normalizeAppearance({ color: THEME_COLOR.ROSE, radius: -10 }),
    ).toEqual({
      contentWidth: "centered",
      sidebarCollapsed: false,
      preset: "default",
      color: "rose",
      radius: "default",
      density: "default",
      textSize: "default",
      fontFamily: "default",
    })
  })

  it("normalizes unknown presets and saves a full theme without changing mode or radius", async () => {
    expect(
      normalizeAppearance({
        preset: "unknown",
        color: THEME_COLOR.ROSE,
        radius: THEME_RADIUS.SMALL,
      }),
    ).toEqual({
      contentWidth: "centered",
      sidebarCollapsed: false,
      preset: "default",
      color: "rose",
      radius: "small",
      density: "default",
      textSize: "default",
      fontFamily: "default",
    })
    expect(
      normalizeAppearance({
        preset: THEME_PRESET.ANTHROPIC,
        color: THEME_COLOR.VIOLET,
        radius: THEME_RADIUS.LARGE,
      }),
    ).toEqual({
      contentWidth: "centered",
      sidebarCollapsed: false,
      preset: "anthropic",
      color: "violet",
      radius: "large",
      density: "default",
      textSize: "default",
      fontFamily: "default",
    })
    const user = userEvent.setup()
    renderControls()
    await user.click(
      screen.getByRole("radio", {
        name: "settings:appearance.presets.anthropic",
      }),
    )
    expect(save).toHaveBeenLastCalledWith({ preset: THEME_PRESET.ANTHROPIC })
  })

  it("saves only the changed field, and resets appearance and mode together", async () => {
    const user = userEvent.setup()
    renderControls()
    await user.click(
      screen.getByRole("radio", { name: "settings:appearance.colors.violet" }),
    )
    expect(save).toHaveBeenLastCalledWith({ color: THEME_COLOR.VIOLET })
    await user.click(
      screen.getByRole("radio", { name: "settings:appearance.radii.none" }),
    )
    expect(save).toHaveBeenLastCalledWith({ radius: THEME_RADIUS.NONE })
    await user.click(
      screen.getByRole("button", { name: "settings:appearance.reset" }),
    )
    expect(save).toHaveBeenLastCalledWith({
      contentWidth: "centered",
      sidebarCollapsed: false,
      preset: THEME_PRESET.DEFAULT,
      color: THEME_COLOR.BLUE,
      radius: THEME_RADIUS.DEFAULT,
      density: "default",
      textSize: "default",
      fontFamily: "default",
      themeMode: THEME_MODE.SYSTEM,
    })
  })

  it.each(["failed", "rejected"] as const)(
    "waits for all saves and ignores an older %s write after the latest success",
    async (outcome) => {
      const user = userEvent.setup()
      savedAppearance.density = "compact"
      const older = createDeferred<{ ok: boolean }>()
      const latest = createDeferred<{ ok: boolean }>()
      save
        .mockReturnValueOnce(older.promise)
        .mockReturnValueOnce(latest.promise)
      renderControls()

      await user.click(
        screen.getByRole("radio", { name: "settings:appearance.colors.rose" }),
      )
      await user.click(
        screen.getByRole("radio", { name: "settings:appearance.radii.none" }),
      )
      const reset = screen.getByRole("button", {
        name: "settings:appearance.reset",
      })
      expect(reset).toBeDisabled()

      await act(async () => {
        latest.resolve({ ok: true })
        await latest.promise
      })
      expect(reset).toBeDisabled()
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()

      await act(async () => {
        if (outcome === "rejected")
          older.reject(new Error("storage unavailable"))
        else older.resolve({ ok: false })
        await older.promise.catch(() => undefined)
      })
      expect(reset).toBeEnabled()
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    },
  )

  it("preserves the latest failure when an older save succeeds afterwards", async () => {
    const user = userEvent.setup()
    savedAppearance.density = "compact"
    const older = createDeferred<{ ok: boolean }>()
    const latest = createDeferred<{ ok: boolean }>()
    save.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise)
    renderControls()

    await user.click(
      screen.getByRole("radio", { name: "settings:appearance.colors.rose" }),
    )
    await user.click(
      screen.getByRole("radio", { name: "settings:appearance.radii.none" }),
    )
    await act(async () => {
      latest.resolve({ ok: false })
      await latest.promise
    })
    expect(screen.getByRole("alert")).toHaveTextContent(
      "settings:appearance.saveFailed",
    )
    expect(
      screen.getByRole("button", { name: "settings:appearance.reset" }),
    ).toBeDisabled()

    await act(async () => {
      older.resolve({ ok: true })
      await older.promise
    })
    expect(screen.getByRole("alert")).toHaveTextContent(
      "settings:appearance.saveFailed",
    )
    expect(
      screen.getByRole("button", { name: "settings:appearance.reset" }),
    ).toBeEnabled()
  })

  it("keeps the saved choice and offers another attempt when storage fails", async () => {
    const user = userEvent.setup()
    save.mockResolvedValueOnce({ ok: false })
    renderControls()
    await user.click(
      screen.getByRole("radio", { name: "settings:appearance.colors.rose" }),
    )
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "settings:appearance.saveFailed",
    )
    expect(
      screen.getByRole("radio", { name: "settings:appearance.colors.blue" }),
    ).toBeChecked()
    await user.click(
      screen.getByRole("radio", { name: "settings:appearance.colors.rose" }),
    )
    expect(save).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})
