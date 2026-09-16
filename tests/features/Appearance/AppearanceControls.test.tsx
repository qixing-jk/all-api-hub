import { act, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { BASIC_SETTINGS_ANCHOR_TO_TAB } from "~/constants/basicSettingsTabs"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import {
  THEME_COLOR,
  THEME_MODE,
  THEME_PRESET,
  THEME_RADIUS,
} from "~/constants/theme"
import { AppearanceControls } from "~/features/Appearance/AppearanceControls"
import { generalSearchControls } from "~/features/BasicSettings/components/tabs/General/General.search"
import { normalizeAppearance } from "~/types/theme"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { render } from "~~/tests/test-utils/render"

const { save, savedAppearance } = vi.hoisted(() => ({
  save: vi.fn(),
  savedAppearance: {
    preset: "default",
    density: "default",
    textSize: "default",
  },
}))
vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => ({
    preferences: {
      appearance: {
        ...savedAppearance,
        color: THEME_COLOR.BLUE,
        radius: THEME_RADIUS.DEFAULT,
      },
    },
    themeMode: THEME_MODE.SYSTEM,
    updateAppearance: save,
  }),
}))

const renderControls = () =>
  render(<AppearanceControls showMode anchors />, {
    withUserPreferencesProvider: false,
    withThemeProvider: false,
  })

describe("appearance controls", () => {
  beforeEach(() => {
    save.mockReset()
    save.mockResolvedValue({ ok: true })
    savedAppearance.preset = THEME_PRESET.DEFAULT
    savedAppearance.density = "default"
    savedAppearance.textSize = "default"
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
    for (const targetId of [
      SETTINGS_ANCHORS.APPEARANCE_PRESET,
      SETTINGS_ANCHORS.APPEARANCE_COLOR,
      SETTINGS_ANCHORS.APPEARANCE_RADIUS,
      SETTINGS_ANCHORS.APPEARANCE_DENSITY,
      SETTINGS_ANCHORS.APPEARANCE_TEXT_SIZE,
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

  it("previews an account, balance, supporting text and shared controls", () => {
    renderControls()
    const preview = screen.getByRole("region", {
      name: "settings:appearance.preview",
    })
    expect(
      within(preview).getByText("settings:appearance.previewAccount"),
    ).toBeVisible()
    expect(within(preview).getByText("$128.50")).toBeVisible()
    expect(
      within(preview).getByText("settings:appearance.previewDetails"),
    ).toBeVisible()
    expect(
      within(preview).getByRole("textbox", {
        name: "settings:appearance.previewInput",
      }),
    ).toHaveValue("settings:appearance.previewNote")
    expect(
      within(preview).getByText("settings:appearance.primaryAction"),
    ).toBeVisible()
  })

  it("normalizes missing and unsupported backup values independently", () => {
    expect(normalizeAppearance(undefined)).toEqual({
      preset: "default",
      color: "blue",
      radius: "default",
      density: "default",
      textSize: "default",
    })
    expect(
      normalizeAppearance({ color: "custom", radius: THEME_RADIUS.SMALL }),
    ).toEqual({
      preset: "default",
      color: "blue",
      radius: "small",
      density: "default",
      textSize: "default",
    })
    expect(
      normalizeAppearance({ color: THEME_COLOR.ROSE, radius: -10 }),
    ).toEqual({
      preset: "default",
      color: "rose",
      radius: "default",
      density: "default",
      textSize: "default",
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
      preset: "default",
      color: "rose",
      radius: "small",
      density: "default",
      textSize: "default",
    })
    expect(
      normalizeAppearance({
        preset: THEME_PRESET.ANTHROPIC,
        color: THEME_COLOR.VIOLET,
        radius: THEME_RADIUS.LARGE,
      }),
    ).toEqual({
      preset: "anthropic",
      color: "violet",
      radius: "large",
      density: "default",
      textSize: "default",
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
      preset: THEME_PRESET.DEFAULT,
      color: THEME_COLOR.BLUE,
      radius: THEME_RADIUS.DEFAULT,
      density: "default",
      textSize: "default",
      themeMode: THEME_MODE.SYSTEM,
    })
  })

  it.each(["failed", "rejected"] as const)(
    "waits for all saves and ignores an older %s write after the latest success",
    async (outcome) => {
      const user = userEvent.setup()
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
