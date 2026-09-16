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
`all-api-hub:appearance-bootstrap` contains only the theme mode, preset, accent,
radius, density, text size and font family; it contains no account data. Old preference records and Plasmo JSON
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


## Interface density

`appearance.density` selects compact, default, or comfortable. The default scale
is 1. Use `py-density-*`, `gap-y-density-*`, and
`space-y-density-*` for vertical rhythm and list/form spacing. Use
`gap-density-*` when a local group intentionally scales both axes; keep horizontal
gutters fixed where column alignment or content width depends on them. Use the
`--density-control*` height tokens through shared controls. Keep text sizes,
content widths, icon artwork, and structural shell dimensions independent.
The navigation sidebar inherits density for its rows and spacing while retaining
its width and shell header height. Calendar columns keep their width while day
heights follow density. The bookmark import virtualizer measures
the larger of `--density-tree-row` and the text line height plus row padding
with a ResizeObserver so live density and text-size changes update its offsets.
For mixed-axis spacing, declare independent axes (`px-4 py-density-4`,
`gap-x-4 gap-y-density-4`). Avoid combining a shorthand with its density axis
in the same class string: formatting can reorder them, and Tailwind Merge then
discards the density class. Let parents own spacing between siblings; keep
component padding responsible for its internal content. Keep small artwork badges,
checkbox/switch graphics, chart canvases, exported images and device touch-target
floors independent; do not shrink them with the general spacing scale.
`cn` registers density spacing with Tailwind Merge so caller overrides still win.

Review the resulting layout, not just the presence of a density class:

- Use one owner for space between siblings. Prefer a parent flex/grid gap for
  stacks; check existing child margins before adding another spacing mechanism.
  Padding still belongs to the component surface and serves a different role.
- Preserve grouping: spacing within a related field group should remain smaller
  than spacing between sections. Do not flatten all spacing to one token.
- For fixed-height inputs, account for padding and borders when checking the
  text's available line height. For wrapping actions, prefer a minimum height
  and let content determine the final height.
- Verify responsive overrides and actual containers, including narrow popups,
  side panels, dialogs and portals. A page without horizontal overflow does not
  prove that individual labels, controls or focus outlines fit.
- Keep click targets usable when reducing visual whitespace. Do not scale down
  typography, artwork or existing coarse-pointer target floors to achieve density.

These principles follow [Carbon's spacing and stacking guidance](https://carbondesignsystem.com/elements/spacing/overview/)
and [Atlassian's spacing foundation](https://atlassian.design/foundations/spacing).

## Text size

`appearance.textSize` selects `default`, `large`, or `extra-large` independently
of density, preset, accent, radius and theme mode. Missing or invalid values
normalize to `default`. Each size control saves and resets only its own field;
the full appearance reset restores both density and text size.

`appearance.css` owns the `--font-size-*` values and their matching line heights.
`style.css` maps them to Tailwind's actual `--text-*` tokens with `@theme inline`,
so utilities resolve the variables from each element's scope. Do not change the
root font size, rem spacing, icon artwork, or density tokens to enlarge text.
The default utility sizes and line heights preserve the existing baseline.
For example, `text-sm` uses 14/20px, 16/24px and 18/28px across the three sizes;
`text-base` uses 16/24px, 18/28px and 20/32px at the default 16px root size.
The unlayered document body rule preserves the extension's inherited 12px
baseline and follows `text-xs` sizing, because Chromium injects an unlayered
default font rule. Isolated content UI uses `text-base` inside its own scope.
Shared badges and calendar labels with a smaller baseline use
`--text-size-increment` while retaining their original default size.

Use `text-3xs` for the 10px caption baseline and `text-2xs` for 11px. Their
sizes follow the same shared increment and their line heights remain relative.
Rare nonstandard baselines use `calc(... + var(--text-size-increment))`.
Responsive overrides still use the shared scale (`sm:text-xs`). Relative `em`
text such as badge counts follows its parent and must not receive a second
increment.

`MarkdownContent` owns Markdown parsing, sanitization, links, typography, and
native disclosure state. Announcements and feedback previews share it. Enable
only the typography plugin in the Tailwind v4 stylesheet; loading the legacy
Tailwind config would also enable unrelated form resets. The `prose-sm` root
uses `text-sm`; headings and other relative text follow it. Semantic prose
colors apply in both themes. Authored style/class/id attributes and legacy
font presentation are removed, preserving content and semantic structure;
formatting must not override the reader's appearance settings.

ECharts renders text outside the CSS utility system. `chartTypography.ts`
resolves the shared increment into pixels for global text, axes, legends,
visual maps, tooltips and explicit numeric font sizes in current chart options.
The renderer reapplies it on text-size changes from the original options, so
increments do not accumulate and chart interaction state survives.

The text-size audit covers arbitrary Tailwind values and responsive variants,
CSS declarations and custom properties, inline `fontSize`/`font` values,
SVG text, Canvas fonts, library typography, and inherited/relative sizes.
Intentional fixed-size exceptions are the monogram artwork in `InitialsIcon`
and `ModelVendorMark`, plus Canvas lettering in exported share snapshots.
These belong to icon/image geometry rather than interface text. Toast text
inherits document sizing; content toasts already use shared text utilities.

Apply text size through the existing appearance bootstrap, React ownership and
preference watcher. Extension documents set `data-theme-text-size` on `html`;
content UI sets it only on its Shadow DOM appearance wrapper. Never write these
preferences to the host webpage's document or body.

Content UI imports `content.css`, a separate stylesheet entry. The content-only
PostCSS pass resolves declaration-level rem lengths at a 16px baseline,
including typography, spacing, control geometry, and CSS variables. It leaves
relative em values, strings, URLs, and media-query breakpoints intact. Merely
setting a Shadow DOM wrapper's font-size cannot isolate rem from the host html.
Extension document CSS keeps rem values, and browser page zoom continues to
scale content UI. Do not load the content stylesheet into extension documents.

Popup, options and sidepanel share the classic appearance bootstrap before
application modules. Content UI waits for its first preference read before
mounting interactive children, so autofocus and modal-ready signals run with
the initial appearance applied. A failed preference read falls back to defaults.

`pnpm lint:typography` scans source-owned arbitrary sizes, inline CSS/JS sizing,
and Canvas font assignments. CI runs it through `pnpm lint`; pre-commit checks
staged source through `validate:staged`. Exceptions are explicit in
`scripts/utils/typography.mjs`: monogram artwork, export snapshot lettering,
and numeric ECharts inputs routed through the common renderer. Browser tests
remain necessary for inherited library styles and actual layout.

Text controls use automatic height and density-driven minimum heights. Account
for borders and padding when sizing inputs and input groups; long button and
select labels must be able to wrap. Keep explicit icon-only dimensions intact.
An extra-large text control may exceed its compact density minimum to fit its
line box. Reserve room for trailing controls and dialog close actions.

The live appearance preview includes an account name, amount, supporting text,
input and actions. `e2e/textSizeSettings.spec.ts` checks independent saving,
reset, search links, cross-view updates and host-page isolation at desktop and
320px/390px widths. Locale and control tests cover long translated labels,
menus and form popovers; the existing density and button tests retain their
default-size assertions. Run these against the Chromium support floor as well
as current Chromium when changing the shared typography contract.
## Interface font

`appearance.fontFamily` offers `default` (follow theme), `sans`, and `serif` in both
appearance settings and the shared drawer. The default theme resolves to sans;
Anthropic resolves to serif. Explicit choices survive preset changes. Font,
text size, and density save and reset independently through existing preferences.
Older backups without a font use the theme default.

`resolveThemeFont` supplies the concrete `data-theme-font` value to startup,
React-owned documents, and the isolated content wrapper. The serif stack uses
local Georgia with CJK serif fallbacks (including Songti and SimSun), so it works
offline without font downloads. Actual glyphs depend on fonts installed locally.
Sans keeps the existing browser extension body font. The serif body rule is
unlayered to override Chrome's injected, unlayered extension stylesheet; ordinary
content uses inheritance, leaving code and `font-mono` contexts monospace.

Charts read their container's font family and update on font-attribute changes,
using the existing typography adapter without resetting chart interactions.
`e2e/fontSettings.spec.ts` covers rendered fonts, persistence, cross-view updates,
theme defaults, the keyboard-operated drawer, and isolated injected UI.
