---
name: live-extension-ui-automation
description: Control, debug, and test live All API Hub extension UI on desktop or Android Firefox, Edge, and Lemur, including installed release diagnostics and development hot updates via CDP/RDP.
---

# Live Extension UI Automation

## Core principle

Automate and test the development browser extension UI against real accounts and logged-in states without closing or disturbing the user's daily primary browser.

## Choose the runtime

- **Android phone/tablet, including Firefox, Edge, or Lemur (狐猴):** read [mobile debugging and hot updates](references/mobile-debugging.md). Use the unified `scripts/mobile-browser.mjs` entrypoint for discovery, diagnostics, and development sessions. Diagnose the installed release when that is the user's goal; do not replace it with a dev build merely to obtain execution access.
- **Desktop Chromium:** use the profile and CDP workflow below. Its build, profile-sync, and launcher steps do not apply to Android.

## Desktop Chromium

Chromium blocks `--remote-debugging-port` on the system default user data directory. To preserve daily browser workflows while enabling CDP automation, tests run in a dedicated dev profile (`AllApiHub/dev-browser`) that shares accounts and sessions across all Git worktrees.

## Window identity

Several debug browsers can be open at once, so the launcher brands the window it starts: the profile name (`AAH <worktree>`, or `AAH dev-browser` for the shared profile) and a per-profile avatar identify it in the window title, profile card and profile picker, the frame gets a stable per-profile tint, and the extension about to be mounted is pinned to the toolbar. A name the user set themselves is kept, and an already installed theme is not replaced.

Chromium reads these files only while starting and rewrites them on exit, so the launcher writes them while the profile is free and pins `--profile-directory` to the profile it branded. Reusing a running browser keeps its existing identity, `--restart` re-applies it, and `--no-identity` skips the branding entirely.

## Shared vs isolated dev profiles

By default every worktree mounts the single shared profile (`AllApiHub/dev-browser`) on CDP port 9222. This reuses one account login across worktrees but couples their browser instances: a `--restart` mounts a different worktree's build and closes another session's tabs, and discovery by title can target the wrong extension.

When concurrent worktrees must not interfere (multi-agent runs), mount a **per-worktree profile** with `--isolate`. The profile resolves to `AllApiHub/dev-browser-<worktree>-<path-hash>`, using the canonical checkout path to distinguish same-named worktrees. Its default CDP port is a stable offset from 9222 based on the resolved profile path. Hash collisions remain possible; isolated clients and the launcher verify the listening browser uses the expected profile before reuse, reload or restart. On a collision, choose a free explicit `CDP_PORT`. Assess existing sessions before seeding an isolated profile:

| Goal | Command |
| :--- | :--- |
| Isolated browser (own profile + port) | `pnpm browser:cdp:isolate` |
| Offline sync when both browsers are already closed | `pnpm browser:sync:isolate -- --cookies` |
| Env-var equivalents | `AAH_DEV_PROFILE_PER_WORKTREE=1` (or `--isolate`); explicit `AAH_DEV_PROFILE_DIR` / `CDP_PORT` still win. |

Live suites (`e2e:cdp:*`) compute their default CDP URL from the same resolver, so launching and driving under `--isolate` need no extra flags. The trade-off: each isolated profile needs its own first login or sync, and each buys an extra resident browser process. The shared-profile default is unchanged.

### Reclaiming debug profiles

Each isolated profile keeps a full Chromium user data directory — on this machine 12 of them held about 10.7 GB, over 4 GB of it rebuildable caches — and a forgotten browser keeps its port, window and memory. `pnpm browser:cdp -- --list` shows what exists; the maintenance commands above reclaim it.

Nothing is ever chosen for deletion by heuristics alone. A profile is reported as an orphan only when all three hold: this tooling generated its name (`dev-browser-<worktree>-<16 hex>`), no browser is using it, and every checkout it recorded mounting no longer exists. Deleting a profile also discards the site logins and extension data inside it, so that step needs `--prune-profiles`; cache pruning is automatic for closed profiles under `--clean` because the browser rebuilds those entries on its next start, and entries younger than a day are left alone.

A deleted profile is partly recoverable: account data comes back from `pnpm browser:sync`, and website sessions plus Local Storage from adding `--cookies`, because both copy out of a still-logged-in daily browser. What does not come back is that profile's browsing history, its installed extensions, and any data that was never synced out of it.

## Available Tooling & Commands

All commands are cross-platform (Windows, macOS, Linux) and runnable directly via `pnpm`:

| Command | Script | Description |
| :--- | :--- | :--- |
| `pnpm browser:sync` | `scripts/sync-extension-profile.mjs` | Discovers extension storage sources (`--list`); copies databases only with browsers closed. Website sessions require `--cookies`. |
| `pnpm browser:cdp` | `scripts/launch-cdp-browser.mjs` | Launches (or connects to) the dedicated debug browser on port `9222` with the current worktree extension mounted. |
| `pnpm browser:cdp -- --list` | `scripts/cdp/dev-browser-registry.mjs` | Inventories every running debug browser (port, profile, PID, mounted worktrees) and every dev profile with its size and whether its checkout still exists. |
| `pnpm browser:cdp -- --stop-browsers` | `scripts/launch-cdp-browser.mjs` | Asks every running debug browser to exit through CDP and waits for it to release its profile. |
| `pnpm browser:cdp -- --clean` | `scripts/cdp/dev-browser-registry.mjs` | Reports the same inventory, then deletes only regenerable caches (`component_crx_cache`, `ProvenanceData`, shader caches) from profiles that are closed. |
| `pnpm browser:cdp -- --prune-profiles` | `scripts/cdp/dev-browser-registry.mjs` | Adds to `--clean` the deletion of *orphaned* profiles — profiles this tooling named whose recorded checkouts have all been deleted. Implies `--clean`. |
| `pnpm e2e:cdp` | `scripts/e2e-cdp-control.mjs` | Connects via CDP, detects the current worktree extension, opens its UI, and automates interactions. |

## Workflow

### 1. Choose the build mode

Use **dev for interactive UI debugging and repeated edits**. Start with `pnpm browser:cdp -- --dev`; the launcher starts WXT in the background and prepares `.output/chrome-mv3-dev`, so a separate `pnpm build` is unnecessary. Explicit `--dev` fails if the development server cannot become ready, preserving the failure for diagnosis instead of automatically falling back to production.

Use **production for final release-like acceptance, production-only failures, or an existing runner that requires `.output/chrome-mv3`**. Launch with `pnpm browser:cdp -- --prod`; reuse an already verified production build when its inputs have not changed. The launcher checks staleness; add `--build` only when a forced rebuild is needed. Switching modes does not itself require rebuilding or restarting the browser. Some site runners hard-code the production path: inspect the selected runner before launching. For repeated UI edits, use exact-path dev discovery as shown below; keep a required production runner as a separate acceptance step.

### 2. Launch, verify, and iterate

```bash
pnpm browser:cdp -- --dev
```
For concurrent worktrees use `pnpm browser:cdp:isolate -- --dev`, and pass `--isolate` to the CDP runner as well.

- **Prioritize Dev Mode (Auto-Spawn)**: By default, the launcher prioritizes the HMR dev mode (`.output/chrome-mv3-dev`). If WXT dev server is not running, it launches it in the background and waits for a server response before loading the extension. Require the rendered Options app separately before driving UI.
- **Actively Suppress Duplicate Browser Windows**: WXT defaults to opening an unconfigured Chrome instance upon launch. To avoid desktop clutter and preserve the shared profile with real accounts, `wxt.config.ts` disables the built-in runner (`webExt.disabled = true` unless `WXT_OPEN_BROWSER=1`), and the launcher passes environment guards. Dev server logs stream silently to `.scratch/wxt-dev.log`.
- **Dynamic Port & Multi-Worktree**: When multiple worktrees run dev servers concurrently, WXT assigns dynamic ports (`3000`, `3001`, `3002`...). The launcher inspects `.output/chrome-mv3-dev/options.html` and probes the Vite client to bind cleanly to the current worktree's assigned port over IPv4 (`127.0.0.1`).
- **Verify the actual target**: Read the launch log's profile, CDP port, extension path, and dev-server URL. Resolve the extension ID from the expected absolute output path with `findInstalledDevExtension`, then require the Options app to render. A listening port, a Vite response, or the first extension target alone does not prove that the current worktree's UI is ready. The launcher can probe other dev-server ports; verify the server URL embedded in this worktree's `options.html` and that edits reach the selected UI before relying on HMR.
- **Iterate in dev**: Keep WXT running and let UI HMR apply edits; wait for the affected UI state before capturing evidence. For background, content-script, or manifest changes, verify the affected context has reloaded and exercise its behavior. When explicit reload is needed, `pnpm browser:cdp -- --dev --reload` targets the current worktree's installed dev output by exact path, verifies the replacement worker identity and a read-only background message response, and refreshes or restores only that extension's open pages. See [background reload verification](references/desktop-dev-recovery.md#reload-the-selected-background). Reloading the browser extension is not proof that every existing site tab has received updated content scripts.
- **Mode switches**: Verify the newly loaded path and ID after changing modes. Dev and production output paths can receive different extension IDs and therefore separate extension storage even in one browser profile. Inspect the chosen extension's saved accounts and the site's authenticated identity independently; use the normal onboarding or authorized session-reuse flow when needed. An empty dev account list does not establish that website login was lost.
- **Convenience Flags**:
  - `pnpm browser:cdp -- --reload`: Reload the current worktree's installed dev extension. Use `--prod --reload` for its installed production extension. Reload does not build, start WXT, or install a missing extension; use the full launch command when the chosen mode is not installed. A missing target or reload failure exits with an error.
  - `pnpm browser:cdp -- --stop-dev`: Terminate the background WXT dev server process.
  - `pnpm browser:cdp -- --prod`: Force standalone production build mode (`.output/chrome-mv3`).
  - `pnpm browser:cdp -- --prod --build`: Force a full production rebuild before launching. Pair `--build` with `--prod`; `--build` alone still prefers dev.
  - `pnpm browser:cdp -- --restart`: Terminate the running debug browser and start a fresh instance. Restarting is also what re-applies a window identity that the current instance still lacks.
  - `pnpm browser:cdp -- --no-identity`: Leave the profile name, frame tint and toolbar pin untouched, e.g. when inspecting a profile someone else branded.

If dev startup fails or the loaded UI does not receive edits, follow [desktop dev recovery](references/desktop-dev-recovery.md). Switch to production only for a diagnosed remaining blocker or the acceptance cases above, and report that reason and the loaded path rather than claiming dev/HMR verification.

### 3. Verify Session Readiness Before Authenticated Flows

Checking readiness is required; synchronizing state is conditional. Use the site's authenticated identity endpoint in the selected dev profile, not a saved extension account, tab title or Cookie count. Reuse a valid target session immediately, checking the expected account ID when known.

If the target is unauthenticated, inspect task-authorized source sessions and select an applicable sync method before asking the user to log in. A target 401 establishes only that the target lacks authentication. A closed-browser requirement applies to database copying, not to all session reuse. Network failures, challenges and identity mismatches require diagnosis rather than a login request.

Read [session assessment and reuse](references/session-reuse.md) for the shared preflight helper, origin-scoped live transfer and offline sync commands. After transfer, re-read the target identity and compare it with the source. Request manual login only after authorized sources and applicable transfer methods have been checked and found unusable; report missing evidence as uninspected, not unavailable. Do not replace an authenticated but mismatched account silently.

### 4. Automate and Verify the Extension UI
For an optional general connectivity check, run the default smoke runner (include `-- --isolate` when launched with an isolated profile):
```bash
pnpm e2e:cdp
```

This smoke runner uses title-based discovery. Use the exact-path pattern below for mode-specific evidence, especially when dev and production extensions coexist; it replaces this optional smoke step rather than requiring both.

### 5. Authoring Custom Automated E2E/CDP Tests
When implementing a new feature or reproducing UI bugs, author or extend a CDP automation script following this pattern:

```javascript
import path from "node:path"

import { findInstalledDevExtension } from "./scripts/cdp/browser-runtime.mjs"
import {
  connectDevBrowser,
  connectExtensionById,
} from "./scripts/cdp/client.mjs"
import { applyIsolateFlag } from "./scripts/cdp/dev-profile.mjs"
import { loadLocalEnv } from "./scripts/utils/local-env.mjs"

// Imports assume a repo-root script; adjust relative paths for a runner under scripts/.
await loadLocalEnv()
applyIsolateFlag(process.argv)

// 1. Pin the current worktree's chosen mode, even with multiple extensions installed.
const extensionDir = path.resolve(".output/chrome-mv3-dev")
const discovery = await connectDevBrowser()
let extensionId
try {
  extensionId = await findInstalledDevExtension(discovery.browser, extensionDir)
} finally {
  await discovery.close()
}
const dev = await connectExtensionById({ extensionId })
let page
try {
  const { context, serviceWorker: sw } = dev

  // 2. Open any extension entrypoint
  page = await context.newPage()
  // Stabilize Framer Motion animations and transitions
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  await page.waitForLoadState("domcontentloaded")

  // 3. Interact with UI primitives via testId or role
  const root = page.locator('[data-testid="options-app"]')
  await root.waitFor({ state: "visible", timeout: 10000 })
  // Await explicit visibility for elements rather than static sleeps
  const target = page.getByTestId("account-management-add-account-button")
  await target.waitFor({ state: "visible", timeout: 8000 })
  await target.click()
  // Radix dialogs/popovers render into document.body portals; locate directly from page
  const dialog = page.getByTestId("account-management-account-dialog")
  await dialog.waitFor({ state: "visible", timeout: 10000 })

  // 4. Inspect extension storage without changing it
  // NOTE: Plasmo Storage serializes envelopes as JSON strings (e.g. { accounts: [...] })
  const accounts = await sw.evaluate(() => {
    return new Promise((resolve) => {
      chrome.storage.local.get("site_accounts", (res) => {
        const data =
          typeof res.site_accounts === "string"
            ? JSON.parse(res.site_accounts)
            : res.site_accounts
        resolve(data?.accounts || [])
      })
    })
  })
} finally {
  await page?.close().catch(() => {})
  await dev.close()
}
```

## Account onboarding validation

For account integrations, use the authentication and guidance contract in [account sites](../add-site-integration/references/account-sites.md#complete-automatic-onboarding). Drive a fresh add-account form with its normal authentication default through automatic detection, any credential guidance, verification, save, and refresh. Manually preselecting another method or pre-seeding a saved account only validates that alternate path; it does not establish that ordinary onboarding works.

When credentials require user interaction, assert that detection preserves the discovered account context, offers the official acquisition page and a clear return/paste action, and reaches an actionable state. Exercise the persistent UI handoff when starting from a popup. Record the authentication mode and starting state in the reusable runner's evidence. If the credential is unavailable, validate the guide independently and report save/refresh as unverified; do not count a successful Cookie fallback as proof of the preferred token path.

## Native resource editor readiness

For native resource editors, a visible modal may still contain only the opening/loading shell while fresh provider data is fetched. Wait for an always-present field from the accepted editor before reading values or asserting secret retention, with a bounded timeout suitable for live provider requests. Modal visibility alone and the default short DOM assertion timeout do not establish that the editor has loaded; avoid replacing this check with a fixed sleep. Once the editor is ready, a missing conditional control may indicate an incomplete detail projection or incorrect visibility state; compare the saved configuration and controlling value before increasing timeouts or forcing the control visible.

## Developer image previews

For UI visual regression capture, stabilization, and side-by-side result presentation, follow [UI visual evidence and capture guidelines](references/ui-visual-evidence.md):
- **Component focus with context**: Target the immediate semantic parent (e.g. table row `tr`, card `.card`, action group, or dialog section) at natural pixel scale instead of full-page viewports (which shrink details to unreadable thumbnails) or micro-cropped icons (which strip spatial context).
- **Stabilization & waiting**: Never rely on static sleeps. Wait explicitly for element visibility (`waitFor({ state: "visible" })`). Freeze Framer Motion transitions (`emulateMedia({ reducedMotion: "reduce" })` and `animations: "disabled"`).
- **Side-by-side composite stitching**: Stitch Before (left, amber/red label) and After (right, emerald/green label) into single composite images (`[BEFORE | AFTER]`) using `pnpm visual:compare` or image compositing, avoiding detached files. For multi-surface updates, provide consolidated Markdown reports or standalone HTML galleries.

For deterministic Playwright workflows, use `pnpm visual:capture --help` and the [generic capture/comparison workflow](../../../CONTRIBUTING.md#local-screenshot-comparison). Select an existing test via `--spec --grep --fixture` and add opt-in `captureVisualViews` checkpoints; optional `--view` settings control dimensions/themes. No registry entry is needed for new surfaces; `--list` exposes maintained hotspot shortcuts. This runner handles current-worktree build validation, capture, metadata and optional baseline pairing in temporary browser profiles. It does not replace authenticated site-specific CDP workflows or add automatic image inspection.

For site adaptation or a requested visual handoff, follow [visual previews](../add-site-integration/references/visual-previews.md). Persist screenshots at meaningful asserted states in the site-specific runner. Agents prioritize representative final results when visual judgment is needed; inspect baseline/comparison/diff images only for a concrete question, rather than after every small edit. Display representative images directly with brief captions, reusing retained artifacts without another image-tool call. Local developer evidence is raw and unmasked by default, lives outside Git, and uses the shared [evidence storage rules](../add-site-integration/references/evidence-and-validation.md#retain-evidence-while-discovering-it). Keep automatic CI/real-site capture settings unchanged; report missing live access or image-rendering limitations explicitly.

## Multi-Worktree Conventions

1. **Shared Profile**: All worktrees resolve to the same OS-level data folder (`%LOCALAPPDATA%\AllApiHub\dev-browser` on Windows, `~/Library/Application Support/AllApiHub/dev-browser` on macOS). Accounts and cookies persist across branch switches.
2. **Current Branch Targeting**: The default smoke runner's title matching is a best-effort discovery heuristic. Exact-path discovery followed by ID-pinned connection establishes the selected worktree and mode when multiple extensions are mounted.
