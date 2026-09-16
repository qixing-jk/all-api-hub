import { useId } from "react"
import { useTranslation } from "react-i18next"

import { SettingsResetButton } from "~/components/SettingsResetButton"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import {
  DEFAULT_THEME_MODE,
  THEME_COLOR,
  THEME_CONTENT_WIDTH,
  THEME_DENSITY,
  THEME_FONT,
  THEME_MODE,
  THEME_PRESET,
  THEME_RADIUS,
  THEME_TEXT_SIZE,
} from "~/constants/theme"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  THEME_COLORS,
  THEME_DENSITIES,
  THEME_FONTS,
  THEME_MODES,
  THEME_PRESETS,
  THEME_RADII,
  THEME_TEXT_SIZES,
  type AppearancePreferences,
} from "~/types/theme"

import { AppearanceFieldset } from "./AppearanceFieldset"
import { AppearanceOption } from "./AppearanceOption"
import {
  AccentPreview,
  ContentWidthPreview,
  DensityPreview,
  RadiusPreview,
  ThemeModePreview,
  TypographyPreview,
} from "./AppearanceOptionPreviews"
import { AppearancePreview } from "./AppearancePreview"
import { getThemeModeOptions } from "./themeModeOptions"
import { useAppearanceSave } from "./useAppearanceSave"

/** Shared, automatically saved controls for the settings page and appearance drawer. */
export function AppearanceControls({
  anchors = false,
  showMode = false,
  showPreview = true,
}: {
  anchors?: boolean
  showMode?: boolean
  showPreview?: boolean
}) {
  const { t } = useTranslation("settings")
  const { preferences, themeMode } = useUserPreferencesContext()
  const appearance = normalizeAppearance(preferences?.appearance)
  const id = useId()
  const { save, saving, failed } = useAppearanceSave()
  const themeOptions = getThemeModeOptions(t)
  const presetLabels = {
    [THEME_PRESET.DEFAULT]: t("appearance.presets.default"),
    [THEME_PRESET.ANTHROPIC]: t("appearance.presets.anthropic"),
  } satisfies Record<AppearancePreferences["preset"], string>
  const presetDescriptions = {
    [THEME_PRESET.DEFAULT]: t("appearance.presetDescriptions.default"),
    [THEME_PRESET.ANTHROPIC]: t("appearance.presetDescriptions.anthropic"),
  } satisfies Record<AppearancePreferences["preset"], string>
  const colorLabels = {
    [THEME_COLOR.BLUE]: t("appearance.colors.blue"),
    [THEME_COLOR.VIOLET]: t("appearance.colors.violet"),
    [THEME_COLOR.ROSE]: t("appearance.colors.rose"),
    [THEME_COLOR.ORANGE]: t("appearance.colors.orange"),
    [THEME_COLOR.GREEN]: t("appearance.colors.green"),
    [THEME_COLOR.SLATE]: t("appearance.colors.slate"),
  } satisfies Record<AppearancePreferences["color"], string>
  const densityLabels = {
    [THEME_DENSITY.COMPACT]: t("appearance.densities.compact"),
    [THEME_DENSITY.DEFAULT]: t("appearance.densities.default"),
    [THEME_DENSITY.COMFORTABLE]: t("appearance.densities.comfortable"),
  } satisfies Record<AppearancePreferences["density"], string>
  const fontLabels = {
    [THEME_FONT.DEFAULT]: t("appearance.fonts.default"),
    [THEME_FONT.SANS]: t("appearance.fonts.sans"),
    [THEME_FONT.SERIF]: t("appearance.fonts.serif"),
  } satisfies Record<AppearancePreferences["fontFamily"], string>
  const textSizeLabels = {
    [THEME_TEXT_SIZE.DEFAULT]: t("appearance.textSizes.default"),
    [THEME_TEXT_SIZE.LARGE]: t("appearance.textSizes.large"),
    [THEME_TEXT_SIZE.EXTRA_LARGE]: t("appearance.textSizes.extraLarge"),
  } satisfies Record<AppearancePreferences["textSize"], string>
  const radiusLabels = {
    [THEME_RADIUS.NONE]: t("appearance.radii.none"),
    [THEME_RADIUS.SMALL]: t("appearance.radii.small"),
    [THEME_RADIUS.DEFAULT]: t("appearance.radii.default"),
    [THEME_RADIUS.LARGE]: t("appearance.radii.large"),
  } satisfies Record<AppearancePreferences["radius"], string>
  return (
    <div className="space-y-density-6" aria-busy={saving}>
      {showMode && (
        <AppearanceFieldset
          labelId={`${id}-mode-label`}
          label={t("theme.mode")}
          resetLabel={`${t("common:actions.reset")}: ${t("theme.mode")}`}
          saving={saving}
          isDefault={themeMode === DEFAULT_THEME_MODE}
          onReset={() => void save({ themeMode: DEFAULT_THEME_MODE })}
        >
          <div className="gap-y-density-2 grid grid-cols-3 gap-x-2">
            {THEME_MODES.map((mode) => (
              <AppearanceOption
                key={mode}
                name={`${id}-mode`}
                value={mode}
                label={themeOptions[mode].label}
                checked={themeMode === mode}
                onSelect={() => void save({ themeMode: mode })}
              >
                <ThemeModePreview
                  mode={mode}
                  preset={appearance.preset}
                  color={appearance.color}
                />
              </AppearanceOption>
            ))}
          </div>
        </AppearanceFieldset>
      )}
      <AppearanceFieldset
        id={anchors ? SETTINGS_ANCHORS.APPEARANCE_PRESET : undefined}
        labelId={`${id}-preset-label`}
        label={t("appearance.preset")}
        resetLabel={`${t("common:actions.reset")}: ${t("appearance.preset")}`}
        saving={saving}
        isDefault={appearance.preset === DEFAULT_APPEARANCE.preset}
        onReset={() => void save({ preset: DEFAULT_APPEARANCE.preset })}
      >
        <div className="gap-y-density-3 grid grid-cols-2 gap-x-3">
          {THEME_PRESETS.map((preset) => (
            <AppearanceOption
              key={preset}
              name={`${id}-preset`}
              value={preset}
              label={presetLabels[preset]}
              checked={appearance.preset === preset}
              onSelect={() => void save({ preset })}
              description={presetDescriptions[preset]}
            >
              <ThemeModePreview
                mode={THEME_MODE.SYSTEM}
                preset={preset}
                color={appearance.color}
              />
            </AppearanceOption>
          ))}
        </div>
      </AppearanceFieldset>
      <AppearanceFieldset
        id={anchors ? SETTINGS_ANCHORS.APPEARANCE_COLOR : undefined}
        labelId={`${id}-color-label`}
        label={t("appearance.color")}
        resetLabel={`${t("common:actions.reset")}: ${t("appearance.color")}`}
        saving={saving}
        isDefault={appearance.color === DEFAULT_APPEARANCE.color}
        onReset={() => void save({ color: DEFAULT_APPEARANCE.color })}
      >
        {appearance.preset !== THEME_PRESET.DEFAULT ? (
          <p className="text-muted-foreground text-sm">
            {t("appearance.presetColorsHint")}
          </p>
        ) : (
          <div className="gap-y-density-3 grid grid-cols-3 gap-x-3">
            {THEME_COLORS.map((color) => (
              <AppearanceOption
                key={color}
                name={`${id}-color`}
                value={color}
                label={colorLabels[color]}
                checked={appearance.color === color}
                onSelect={() => void save({ color })}
              >
                <AccentPreview color={color} />
              </AppearanceOption>
            ))}
          </div>
        )}
      </AppearanceFieldset>
      <AppearanceFieldset
        id={anchors ? SETTINGS_ANCHORS.APPEARANCE_RADIUS : undefined}
        labelId={`${id}-radius-label`}
        label={t("appearance.radius")}
        resetLabel={`${t("common:actions.reset")}: ${t("appearance.radius")}`}
        saving={saving}
        isDefault={appearance.radius === DEFAULT_APPEARANCE.radius}
        onReset={() => void save({ radius: DEFAULT_APPEARANCE.radius })}
      >
        <div className="gap-y-density-2 grid grid-cols-4 gap-x-2">
          {THEME_RADII.map((radius) => (
            <AppearanceOption
              key={radius}
              name={`${id}-radius`}
              value={radius}
              label={radiusLabels[radius]}
              checked={appearance.radius === radius}
              onSelect={() => void save({ radius })}
            >
              <RadiusPreview radius={radius} />
            </AppearanceOption>
          ))}
        </div>
      </AppearanceFieldset>
      <AppearanceFieldset
        id={anchors ? SETTINGS_ANCHORS.APPEARANCE_DENSITY : undefined}
        labelId={`${id}-density-label`}
        label={t("appearance.density")}
        resetLabel={t("appearance.resetDensity")}
        saving={saving}
        isDefault={appearance.density === DEFAULT_APPEARANCE.density}
        onReset={() => void save({ density: DEFAULT_APPEARANCE.density })}
        description={t("appearance.densityDescription")}
      >
        <div className="gap-y-density-2 grid grid-cols-3 gap-x-2">
          {THEME_DENSITIES.map((density) => (
            <AppearanceOption
              key={density}
              name={`${id}-density`}
              value={density}
              label={densityLabels[density]}
              checked={appearance.density === density}
              onSelect={() => void save({ density })}
            >
              <DensityPreview density={density} />
            </AppearanceOption>
          ))}
        </div>
      </AppearanceFieldset>
      <AppearanceFieldset
        id={anchors ? SETTINGS_ANCHORS.APPEARANCE_TEXT_SIZE : undefined}
        labelId={`${id}-textSize-label`}
        label={t("appearance.textSize")}
        resetLabel={t("appearance.resetTextSize")}
        saving={saving}
        isDefault={appearance.textSize === DEFAULT_APPEARANCE.textSize}
        onReset={() => void save({ textSize: DEFAULT_APPEARANCE.textSize })}
        description={t("appearance.textSizeDescription")}
      >
        <div className="gap-y-density-2 grid grid-cols-3 gap-x-2">
          {THEME_TEXT_SIZES.map((textSize) => (
            <AppearanceOption
              key={textSize}
              name={`${id}-text-size`}
              value={textSize}
              label={textSizeLabels[textSize]}
              checked={appearance.textSize === textSize}
              onSelect={() => void save({ textSize })}
            >
              <TypographyPreview
                textSize={textSize}
                fontFamily={appearance.fontFamily}
                preset={appearance.preset}
              />
            </AppearanceOption>
          ))}
        </div>
      </AppearanceFieldset>
      <AppearanceFieldset
        id={anchors ? SETTINGS_ANCHORS.APPEARANCE_FONT : undefined}
        labelId={`${id}-font-label`}
        label={t("appearance.font")}
        resetLabel={t("appearance.resetFont")}
        saving={saving}
        isDefault={appearance.fontFamily === DEFAULT_APPEARANCE.fontFamily}
        onReset={() => void save({ fontFamily: DEFAULT_APPEARANCE.fontFamily })}
        description={t("appearance.fontDescription")}
      >
        <div className="gap-y-density-2 grid grid-cols-3 gap-x-2">
          {THEME_FONTS.map((font) => (
            <AppearanceOption
              key={font}
              name={`${id}-font`}
              value={font}
              label={fontLabels[font]}
              checked={appearance.fontFamily === font}
              onSelect={() => void save({ fontFamily: font })}
            >
              <TypographyPreview
                textSize={THEME_TEXT_SIZE.DEFAULT}
                fontFamily={font}
                preset={appearance.preset}
              />
            </AppearanceOption>
          ))}
        </div>
      </AppearanceFieldset>
      <AppearanceFieldset
        id={anchors ? SETTINGS_ANCHORS.APPEARANCE_CONTENT_WIDTH : undefined}
        labelId={`${id}-content-width-label`}
        label={t("appearance.contentWidth")}
        resetLabel={`${t("common:actions.reset")}: ${t("appearance.contentWidth")}`}
        saving={saving}
        isDefault={appearance.contentWidth === DEFAULT_APPEARANCE.contentWidth}
        onReset={() =>
          void save({ contentWidth: DEFAULT_APPEARANCE.contentWidth })
        }
        description={t("appearance.contentWidthDescription")}
      >
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              [
                THEME_CONTENT_WIDTH.CENTERED,
                t("appearance.contentWidths.centered"),
              ],
              [THEME_CONTENT_WIDTH.FULL, t("appearance.contentWidths.full")],
            ] as const
          ).map(([contentWidth, label]) => (
            <AppearanceOption
              key={contentWidth}
              name={`${id}-content-width`}
              value={contentWidth}
              label={label}
              checked={appearance.contentWidth === contentWidth}
              onSelect={() => void save({ contentWidth })}
            >
              <ContentWidthPreview contentWidth={contentWidth} />
            </AppearanceOption>
          ))}
        </div>
      </AppearanceFieldset>
      {showPreview && (
        <AppearancePreview presetLabel={presetLabels[appearance.preset]} />
      )}
      {failed && (
        <p role="alert" className="text-destructive-text text-sm">
          {t("appearance.saveFailed")}
        </p>
      )}
      <SettingsResetButton
        label={t("appearance.reset")}
        disabled={
          saving ||
          (themeMode === DEFAULT_THEME_MODE &&
            Object.entries(DEFAULT_APPEARANCE).every(
              ([key, value]) =>
                appearance[key as keyof AppearancePreferences] === value,
            ))
        }
        onClick={() =>
          void save({ ...DEFAULT_APPEARANCE, themeMode: DEFAULT_THEME_MODE })
        }
      />
    </div>
  )
}
