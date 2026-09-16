import {
  THEME_ATTRIBUTES,
  THEME_CONTENT_WIDTH,
  THEME_MODE,
  THEME_RADIUS,
} from "~/constants/theme"
import {
  resolveThemeFont,
  type AppearancePreferences,
  type ThemeMode,
} from "~/types/theme"
import { getAppearanceScopeAttributes } from "~/utils/ui/themePreferences"

/** Each tile owns its light/dark palette, even inside a dark appearance drawer. */
export function ThemeModePreview({
  mode,
  preset,
  color,
}: Pick<AppearancePreferences, "preset" | "color"> & { mode: ThemeMode }) {
  const modes =
    mode === THEME_MODE.SYSTEM ? [THEME_MODE.LIGHT, THEME_MODE.DARK] : [mode]
  return (
    <span className="flex h-full w-full overflow-hidden rounded-sm">
      {modes.map((theme) => (
        <span
          key={theme}
          {...getAppearanceScopeAttributes({ preset, color })}
          className={`${theme === THEME_MODE.DARK ? "dark" : ""} bg-background flex min-w-0 flex-1 gap-1 p-2`}
        >
          <span className="bg-sidebar border-border w-2 shrink-0 rounded-xs border" />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="bg-foreground/60 h-1 w-2/3 rounded-full" />
            <span className="bg-card border-border flex flex-1 flex-col justify-end gap-1 rounded-xs border p-1">
              <span className="bg-muted-foreground/40 h-1 w-3/4 rounded-full" />
              <span className="bg-primary h-2 w-1/2 rounded-xs" />
            </span>
          </span>
        </span>
      ))}
    </span>
  )
}

/** Show the solid and subtle accent treatments together without changing the theme. */
export function AccentPreview({ color }: Pick<AppearancePreferences, "color">) {
  return (
    <span
      {...{ [THEME_ATTRIBUTES.COLOR]: color }}
      className="flex w-full items-center justify-center gap-2 px-2"
    >
      <span className="bg-theme-600 flex h-6 w-9 items-center justify-center rounded-sm">
        <span className="bg-theme-50 h-1 w-4 rounded-full" />
      </span>
      <span className="border-theme-600 bg-theme-100 flex size-5 items-center justify-center rounded-full border">
        <span className="bg-theme-600 size-2 rounded-full" />
      </span>
    </span>
  )
}

const RADIUS_PREVIEW_PX = {
  [THEME_RADIUS.NONE]: 0,
  [THEME_RADIUS.SMALL]: 6,
  [THEME_RADIUS.DEFAULT]: 12,
  [THEME_RADIUS.LARGE]: 18,
} satisfies Record<AppearancePreferences["radius"], number>

/** Same card dimensions isolate the corner shape from all other preferences. */
export function RadiusPreview({
  radius,
}: Pick<AppearancePreferences, "radius">) {
  return (
    <span
      className="border-primary/70 bg-primary/10 flex h-9 w-10 items-center justify-center border-2"
      style={{ borderRadius: RADIUS_PREVIEW_PX[radius] }}
    >
      <span className="bg-primary/60 h-1 w-4 rounded-full" />
    </span>
  )
}

/** The same three rows use the real density spacing tokens, independently of text size. */
export function DensityPreview({
  density,
}: Pick<AppearancePreferences, "density">) {
  return (
    <span
      {...{ [THEME_ATTRIBUTES.DENSITY]: density }}
      className="gap-density-1 flex w-full flex-col px-2"
    >
      {[0, 1, 2].map((row) => (
        <span
          key={row}
          className="bg-card border-border py-density-1 flex items-center gap-1 rounded-xs border px-1"
        >
          <span className="bg-primary/50 size-1.5 shrink-0 rounded-full" />
          <span className="bg-foreground/40 h-0.5 w-2/3 rounded-full" />
        </span>
      ))}
    </span>
  )
}

/** Resolve the offered font rather than inheriting the currently selected font. */
export function TypographyPreview({
  textSize,
  fontFamily,
  preset,
}: Pick<AppearancePreferences, "textSize" | "fontFamily" | "preset">) {
  return (
    <span
      {...{
        [THEME_ATTRIBUTES.TEXT_SIZE]: textSize,
        [THEME_ATTRIBUTES.FONT]: resolveThemeFont({ fontFamily, preset }),
      }}
      className="text-foreground flex flex-col items-center"
    >
      <span className="text-base">Aa</span>
      <span className="text-muted-foreground text-xs tabular-nums">123</span>
    </span>
  )
}

/** Keep the page frame identical so only the available content width changes. */
export function ContentWidthPreview({
  contentWidth,
}: Pick<AppearancePreferences, "contentWidth">) {
  return (
    <span className="border-border bg-background mx-2 flex h-12 w-full gap-1 rounded-sm border p-1">
      <span className="bg-muted w-2 shrink-0 rounded-xs" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="bg-foreground/40 h-1 w-full rounded-full" />
        <span
          className={`bg-primary/20 mx-auto flex flex-1 flex-col justify-center gap-1 rounded-xs p-1 ${contentWidth === THEME_CONTENT_WIDTH.CENTERED ? "w-2/3" : "w-full"}`}
        >
          <span className="bg-primary/60 h-1 w-full rounded-full" />
          <span className="bg-primary/40 h-1 w-2/3 rounded-full" />
        </span>
      </span>
    </span>
  )
}
