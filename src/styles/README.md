# Color contract

`colors.css` owns light/dark surface, content, border, interaction, sidebar,
notification and chart roles. `appearance.css` owns the configurable accent ramp
(`--theme-color-50` through `--theme-color-950`) and existing appearance presets.
`style.css` exposes these roles as Tailwind utilities.

`themePresets.css` adds complete named palettes. `appearance.preset` selects
the preset independently of `themeMode` and radius. The default preset preserves
the existing neutral surfaces and selected accent; Anthropic supplies its own ramp,
warm surfaces and chart palette in both modes. Switching back restores the saved
accent choice. New presets should define all surface roles for both modes and
leave status/brand palettes intact. Add their IDs to `THEME_PRESETS`, normalize
older backups to `default`, and provide searchable, translated choice labels.

- Use `bg-card`, `text-muted-foreground`, `border-border`, etc. for neutral UI.
  Choose the role by its purpose, rather than introducing another gray palette.
- Use `primary` / `primary-foreground` for solid actions and selected controls.
  Use `theme-*` for graded accent emphasis. A custom accent must supply the entire
  ramp plus readable solid-action foreground, link and focus-ring colors.
- Use `popover` / `popover-foreground` for portals and floating surfaces;
  `sidebar-*` for navigation. Shared button variables also drive the preview.
- Status roles (`success`, `warning`, `destructive`, `info`) remain independent
  of accent and preset selection. Use their paired foregrounds; the foreground
  of a solid action is different from inline text or a tinted message.
  `semantic-*` palettes are implementation details of `colors.css`.
  External brand marks and categorical data colors remain independent too.
- Apply future user-defined overrides to the document root, alongside the theme
  class and preset attributes. This reaches React portals and library surfaces.
  Override roles for each mode; a primary-color override alone does not define a
  complete surface palette. Persistence and color-picker UI are separate from
  this CSS contract.
  Content-script UI applies its preferences to its own `data-color-scope`
  wrapper instead of modifying the host document. Theme selectors match the
  scope's own `.dark` class so previews and isolated roots can own their mode.

Chart builders use `CHART_COLORS` symbols. `EChart` resolves them to sRGB for
Canvas/SVG, supplies the shared series palette and tooltip surface, and refreshes
colors after root theme/style changes. Explicit caller colors and formatter
functions remain intact; do not pass unresolved CSS variables directly to
ECharts outside this wrapper.

Browser coverage in `e2e/colorSystem.spec.ts` injects independent colors into
real controls and portals in both modes. `e2e/balanceHistoryUserFlows.spec.ts`
checks that Canvas pixels change immediately when a chart role is overridden.

## Status and category roles

For each status, the contract provides the following pairs (shown for success):

| Purpose | Background | Foreground | Hover / border |
| --- | --- | --- | --- |
| Solid action | `success` | `success-foreground` | `success-hover` |
| Inline text or icon | Existing surface | `success-text` | — |
| Message or badge | `success-soft` | `success-soft-foreground` | `success-soft-hover`, `success-border` |

Shared Button, Badge, Alert, Notice, form feedback and toast components consume
these roles. A warning or destructive action must keep its own foreground even
when a preset changes `primary-foreground`. Form focus indicators use `ring`
unless the field has a success/error state. Ordinary checked switches use
`primary`; adding a green class at a call site confuses selection with success.

Pricing uses `pricing-input`, `pricing-output`, `pricing-cache-read`,
`pricing-cache-write` and `pricing-per-call`, with a matching `-soft` background.
These colors distinguish billing dimensions; they do not report success or
failure. Input pricing follows the accent, while the other categories retain
their own palettes. Cashflow uses `cashflow-income` and `cashflow-expense`.
Unavailable amounts keep neutral text instead of presenting an amount or status.

`e2e/semanticColors.spec.ts` measures browser-resolved solid, soft, inline,
hover and pricing contrast, including light scopes under dark parents. It also
checks all six accent choices. Text pairs must reach 4.5:1. These tests and
`e2e/buttonSizing.spec.ts` can run with `AAH_E2E_CHROME_EXECUTABLE_PATH` against
the Chromium support floor (114) as well as current Chromium. The scheduled
browser compatibility workflow owns the broader version matrix.

## Popup startup

The popup loads its shared CSS and the classic `appearance-bootstrap.js`
entrypoint from HTML. WXT emits that script separately; `vite-ignore` prevents
Vite from trying to bundle it as a module. Keep it before the application module
so neither React nor locale loading delays the appearance bootstrap.

The bootstrap synchronously applies the Web Storage appearance hint, or system
mode if no usable hint exists, then reads canonical extension preferences.
`all-api-hub:appearance-bootstrap` contains only the theme mode, preset, accent
and radius; it contains no account data. Old preference records and Plasmo JSON
strings are normalized. Corrupt or inaccessible storage preserves the usable
cached/system shell. React marks ownership when preferences finish loading,
preventing a delayed bootstrap read from replacing a newer selection, and keeps
the hint updated across extension views.

The skeleton uses `background` and `muted` and respects reduced motion.
`e2e/popupAppearanceBootstrap.spec.ts` blocks the built application bundle to
verify all four preset/mode combinations independently, then checks React takeover.

## Preventing raw colors

Run `pnpm lint:colors` to check source utilities, CSS and HTML. It rejects raw
Tailwind palette utilities, arbitrary utility colors and direct Tailwind palette
variables (including white/black) outside explicit definition owners. Literal
HEX, RGB/HSL, HWB, Lab/LCH, OKLab/OKLCH and `color()` values with numeric channels
are checked in CSS declarations, HTML style/color attributes and JS/TS style
contexts. Comments and `url()` references are ignored. Use a role instead of
adding a local palette override.

JS/TS color contexts use local syntax: style/color properties and JSX attributes,
named constants such as `foregroundColor` or `axis`, assignments such as
`context.fillStyle`, and calls such as `setProperty("color", value)`. Conditional
result branches and template values keep that context; selectors, lookup keys
and conditions do not. Ordinary anchors and business data such as `href="#abc"`
or `{ reference: "#123456" }` are not colors. Utility and palette-variable
spellings are checked even in standalone class constants.
The guard does not follow aliases, evaluate computed colors or prove that a
chosen role has the right meaning or contrast; component and browser checks
still own those questions. Use descriptive color/style names for constants.

The guard also runs during `lint` and the pre-commit staged checks. `--staged`
reads indexed blobs in one batch, including the baseline, independently of
unstaged edits. Changes to the guard or its baseline check all indexed source
files. `--report` prints the current findings as JSON.
`scripts/color-token-baseline.json` records exact occurrence allowances and
their reasons. Added occurrences fail, and removed colors or files require
removing their allowances. Existing exemptions are limited to color-definition
owners, brand assets, the Mesh Gradient implementation and the vendored
development-tools bundle. The development toolbar badge has one documented
baseline allowance because it is outside CSS theme scopes.
