import { act, screen } from "@testing-library/react"
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

const { save } = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => ({
    preferences: {
      appearance: { color: THEME_COLOR.BLUE, radius: THEME_RADIUS.DEFAULT },
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
  })

  it("keeps searchable appearance controls linked to visible settings groups", () => {
    renderControls()
    for (const targetId of [
      SETTINGS_ANCHORS.APPEARANCE_PRESET,
      SETTINGS_ANCHORS.APPEARANCE_COLOR,
      SETTINGS_ANCHORS.APPEARANCE_RADIUS,
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

  it("normalizes missing and unsupported backup values independently", () => {
    expect(normalizeAppearance(undefined)).toEqual({
      preset: "default",
      color: "blue",
      radius: "default",
    })
    expect(
      normalizeAppearance({ color: "custom", radius: THEME_RADIUS.SMALL }),
    ).toEqual({
      preset: "default",
      color: "blue",
      radius: "small",
    })
    expect(
      normalizeAppearance({ color: THEME_COLOR.ROSE, radius: -10 }),
    ).toEqual({
      preset: "default",
      color: "rose",
      radius: "default",
    })
  })

  it("normalizes unknown presets and saves a full theme without changing mode or radius", async () => {
    expect(
      normalizeAppearance({
        preset: "unknown",
        color: THEME_COLOR.ROSE,
        radius: THEME_RADIUS.SMALL,
      }),
    ).toEqual({ preset: "default", color: "rose", radius: "small" })
    expect(
      normalizeAppearance({
        preset: THEME_PRESET.ANTHROPIC,
        color: THEME_COLOR.VIOLET,
        radius: THEME_RADIUS.LARGE,
      }),
    ).toEqual({ preset: "anthropic", color: "violet", radius: "large" })
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
