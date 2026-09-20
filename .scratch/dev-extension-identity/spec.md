# Dev extension identity: tell which directory's code a locally loaded build is

Status: ready-for-agent

## Problem

Several local builds (multiple worktrees, or a worktree plus a release build loaded
unpacked) can be loaded into the same browser. They look identical everywhere:
the same toolbar icon, the same extension name, the same context menu entries, the
same page titles. Nothing on screen answers "which directory's code is this?".

Path is the only information that answers it, and the extension has no API that
reads its own load directory. So the path must be **baked at build time** and
carried into every surface, with a color + short code as the compressed form for
surfaces that cannot show a path.

## Decisions

- Seeded from the **build-time project root**, not `runtime.id`. One baked constant
  is identical in the background worker, popup, side panel, options page and
  content scripts, so no cross-context messaging is needed.
- Baked only for the `serve` command (development). Production and test builds bake
  `null`, so no local path ever ships.
- Path is the primary information. Where a surface is too narrow for the full path,
  it shows the last two segments, and gets a hover tooltip (or, where there is no
  hover, a neighboring surface) showing the full path.
- Colors cannot be collision-free: instances cannot see each other (storage is
  isolated per extension). Collisions are absorbed by the text channel (badge code
  and path tail), so color is never the only signal.
- The dashed-out "detect the actually loaded directory" is out of scope: no
  WebExtension API exposes it. The values are labelled by origin (baked vs runtime)
  so nothing implies more certainty than exists.

### Derived values

| Value | Example | Used by |
| --- | --- | --- |
| `path` | `G:\Development_Data\WorkSpaces\ensoai\all-api-hub\temp` | tooltips, dev panel |
| `pathTail` | `G:…\all-api-hub\temp` (last 2 segments, drive kept) | headers, menus, badges |
| `badgeText` | `TEM` (first 3 alphanumerics of the last segment) | toolbar badge |
| `color` | `hsl(15 65% 44%)` | badge background, section markers |

Palette: 12 slots, `hue = 15 + 30 * index`, saturation 65%, lightness alternating
44/58% so neighbouring slots differ by lightness as well as hue. Slot index is
`fnv1a(seed) % 12`.

### Channels

| Channel | Content |
| --- | --- |
| Toolbar badge | color background + `badgeText` |
| Toolbar tooltip | extension name + full path |
| Manifest `name` (serve) | `All API Hub (dev) <pathTail>` |
| Manifest `description` (serve) | existing build-time path injection, unchanged |
| Context menu titles | `[<pathTail>] ` prefix (text only, no color) |
| Page titles (options/popup/side panel) | ` · <pathTail>` suffix, via `setDocumentTitle` |
| Dev panel ball | ring in the instance color; hovering reveals a label with the shortened source path (the badge code only when no path was baked) and a tooltip listing the source and output directories. Label is absolute and `pointer-events-none`, so the ball keeps a 32px hit area and the page underneath stays clickable. |
| Content-script UI | tag rendered only while extension UI is mounted: color dot + path tail, native tooltip with the full path, non-interactive |
| Dev panel | `Instance` section, folded by default at the end of the panel: full path, output path, extension id, install type, mode, browser, built-at, extension version. Its folded header shows the code the badge uses. |

The identity lives on dev-only chrome: the floating dev ball on extension pages
and the injected-UI tag on web pages. Release UI is byte-identical to before,
because every marker is gated on the identity having a color, which only a
development build produces.

Surfaces that are not forced to be short show the path, not the code:
`formatDevInstanceLabel()` returns the shortened path and falls back to the badge
code only when no path was baked. The ball, the folded dev panel header, the
content-script tag and the context menu prefix all use it, so surfaces of
different widths still agree on the same instance. The toolbar badge is the only
surface with a hard limit (four characters), and it is paired with a tooltip
carrying the full path.

## Non-goals (this pass)

- Notifications are not prefixed.
- No manual color re-roll or per-instance alias.
- No favicon/icon re-tinting.
- No per-overlay edge bars inside toasts/modals.
- No "loaded build vs on-disk build" staleness probe.

## Files

- `src/utils/core/devIdentity.ts` (new): pure derivation, types, palette, path
  shortening, badge code, `formatDevManifestName`.
- `src/utils/browser/extensionIdentity.ts` (new): baked constants + runtime
  composition, `getDevIdentity()`.
- `src/utils/core/devBranding.ts`: toolbar title, menu prefix, page title suffix.
- `wxt.config.ts`: bake the identity for `serve`, dev manifest name.
- `src/utils/navigation/documentTitle.ts`: page title suffix.
- `src/entrypoints/background/devActionBranding.ts`: badge text/color/tooltip.
- `src/entrypoints/background/contextMenus.ts`: dev prefix on menu titles.
- `src/features/DevPanel/types.ts`, `DevPanel.tsx`: `rows` support, and the
  floating ball carries the instance ring and code.
- `src/features/DevPanel/sections/instanceIdentitySection.tsx` (new).
- `src/entrypoints/content/shared/DevIdentityTag.tsx` (new) + `ContentReactRoot.tsx`.
- `tests/test-utils/devIdentityFixtures.ts` (new): the only place identity fixtures
  and path shapes are defined.
- `scripts/color-token-baseline.json`: drop the retired `#DC2626` allowance.

## Rejected

Markers were first added to the popup and options headers (logo outline plus an
inline code beside the version badge). They kept the header height, but they still
put dev-only chrome inside the product's own layout, and the options header read
as three competing elements. Identity now lives on dev-only chrome only.

## Constraints discovered while implementing

- Paths and identities in tests come from `tests/test-utils/devIdentityFixtures.ts`,
  never from a developer's own checkout. The fixture module covers the shapes that
  have to work anywhere (Windows drives, POSIX roots, UNC shares, shallow paths,
  trailing separators, directory names with spaces or no ASCII letters) and derives
  the badge code, palette slot and color through the real functions, so a fixture
  can never describe an identity the extension would not produce. The derivation
  rules themselves are pinned in `tests/utils/devIdentity.test.ts`, including the
  palette slot each fixture path hashes to.

- `wxt.config.ts` is loaded through jiti, which cannot resolve the `~/` aliases,
  so every module reachable from the config may only use relative imports or none.
  That is why the manifest-name formatter takes the app name as an argument
  instead of importing it, and why `BakedDevIdentity` lives in `devIdentity.ts`
  (import-free) rather than beside the runtime reader in `extensionIdentity.ts`:
  the config has to be able to name the shape it bakes and the extension reads
  back. `DEV_BUILD_MARKER` lives there for the same reason, so the manifest name
  and the toolbar title cannot disagree about what marks a local build.
- Vite imports are evaluated for every command, so an aliased import in the config
  graph breaks release builds as well; the config suite covers what the factories
  produce rather than how they are loaded.
- Palette colors are emitted as `rgb(r, g, b)` strings built from numeric hue
  slots, which keeps the color-token lint free of new literals.
- The identity color must be one string that both inline CSS and
  `action.setBadgeBackgroundColor` accept. Space-separated `hsl(15 65% 44%)` is
  valid CSS but makes the badge API throw "The color specification could not be
  parsed.", which silently left the toolbar badge in Chrome's default color while
  the pages showed the palette color. `rgb(r, g, b)` works in both and survives
  the API round trip unchanged.
- Every toolbar setting is applied in its own try/catch: a rejected badge color
  used to abort the call before `setTitle`, so the tooltip disappeared with it.
