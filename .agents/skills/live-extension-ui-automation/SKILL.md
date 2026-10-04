---
name: live-extension-ui-automation
description: Control, debug, and test the live dev browser extension UI (Options, Popup, Sidepanel) via CDP with persistent login states and accounts.
---

# Live Extension UI Automation

## Core principle

Automate and test the development browser extension UI against real accounts and logged-in states without closing or disturbing the user's daily primary browser.

Chromium blocks `--remote-debugging-port` on the system default user data directory. To preserve daily browser workflows while enabling CDP automation, tests run in a dedicated dev profile (`AllApiHub/dev-browser`) that shares accounts and sessions across all Git worktrees.

## Shared vs isolated dev profiles

By default every worktree mounts the single shared profile (`AllApiHub/dev-browser`) on CDP port 9222. This reuses one account login across worktrees but couples their browser instances: a `--restart` mounts a different worktree's build and closes another session's tabs, and discovery by title can target the wrong extension.

When concurrent worktrees must not interfere (multi-agent runs), mount a **per-worktree profile** with `--isolate`. The profile resolves to `AllApiHub/dev-browser-<worktree>-<path-hash>`, using the canonical checkout path to distinguish same-named worktrees. Its default CDP port is a stable offset from 9222 based on the resolved profile path. Hash collisions remain possible; isolated clients and the launcher verify the listening browser uses the expected profile before reuse, reload or restart. On a collision, choose a free explicit `CDP_PORT`. Account state is cloned from the primary browser into that profile once:

| Goal | Command |
| :--- | :--- |
| Isolated browser (own profile + port) | `pnpm browser:cdp:isolate` |
| Sync accounts/cookies/localStorage into it | `pnpm browser:sync:isolate -- --cookies` |
| Env-var equivalents | `AAH_DEV_PROFILE_PER_WORKTREE=1` (or `--isolate`); explicit `AAH_DEV_PROFILE_DIR` / `CDP_PORT` still win. |

Live suites (`e2e:cdp:*`) compute their default CDP URL from the same resolver, so launching and driving under `--isolate` need no extra flags. The trade-off: each isolated profile needs its own first login or sync, and each buys an extra resident browser process. The shared-profile default is unchanged.

## Available Tooling & Commands

All commands are cross-platform (Windows, macOS, Linux) and runnable directly via `pnpm`:

| Command | Script | Description |
| :--- | :--- | :--- |
| `pnpm browser:sync` | `scripts/sync-extension-profile.mjs` | **Auto-discovers** accounts from the user's primary Edge/Chrome profile and clones them to the dev sandbox. |
| `pnpm browser:cdp` | `scripts/launch-cdp-browser.mjs` | Launches (or connects to) the dedicated debug browser on port `9222` with the current worktree extension mounted. |
| `pnpm e2e:cdp` | `scripts/e2e-cdp-control.mjs` | Connects via CDP, detects the current worktree extension, opens its UI, and automates interactions. |

## Workflow

### 1. Build Current Worktree Output
Always ensure the extension is built for the current branch:
```bash
pnpm build
```

### 2. (Optional) Sync Real Accounts & Credentials
If the dev browser has not yet been seeded with accounts, or if fresh accounts were added in the primary browser:
```bash
pnpm browser:sync
```
- **Auto-Discovery**: Scans Edge, Chrome, and Brave across all profiles (`Default`, `Profile 1`, `Profile 2`...) and selects the largest/latest All API Hub dataset.
- **List Candidates**: Run `pnpm browser:sync -- --list` to inspect all detected profile and extension data sources across the system.
- **Pin Specific Source**: Pass `--source-profile <name>` and/or `--source-ext <id>`:
  ```bash
  # Example: sync precisely from official Edge Addons store extension in Profile 2
  pnpm browser:sync -- --source-profile "Profile 2" --source-ext "abffolffkoejhapkgkmmaaijafghclom"
  ```
- **Website Cookies**: Pass `--cookies` (e.g. `pnpm browser:sync -- --cookies`) to clone web session cookies.

### 3. Launch or Reuse the CDP Browser
```bash
pnpm browser:cdp
```
- **Prioritize Dev Mode (Auto-Spawn)**: By default, the launcher prioritizes the HMR dev mode (`.output/chrome-mv3-dev`). If WXT dev server is not running, it automatically and silently launches it in the background, waits for the initial pre-rendering to finish, and mounts the hot dev extension.
- **Actively Suppress Duplicate Browser Windows**: WXT defaults to opening an unconfigured Chrome instance upon launch. To avoid desktop clutter and preserve the shared profile with real accounts, `wxt.config.ts` disables the built-in runner (`webExt.disabled = true` unless `WXT_OPEN_BROWSER=1`), and the launcher passes environment guards. Dev server logs stream silently to `.scratch/wxt-dev.log`.
- **Dynamic Port & Multi-Worktree**: When multiple worktrees run dev servers concurrently, WXT assigns dynamic ports (`3000`, `3001`, `3002`...). The launcher inspects `.output/chrome-mv3-dev/options.html` and probes the Vite client to bind cleanly to the current worktree's assigned port over IPv4 (`127.0.0.1`).
- **Live Extension Hot-Reload**: If the debug browser on port 9222 is already open, running `pnpm browser:cdp` instantly triggers `chrome.runtime.reload()` over CDP and refreshes open extension tabs without restarting the browser.
- **Convenience Flags**:
  - `pnpm browser:cdp -- --reload`: Instantly trigger `chrome.runtime.reload()` in the running browser.
  - `pnpm browser:cdp -- --stop-dev`: Terminate the background WXT dev server process.
  - `pnpm browser:cdp -- --prod`: Force standalone production build mode (`.output/chrome-mv3`).
  - `pnpm browser:cdp -- --build`: Force a full production rebuild before launching.
  - `pnpm browser:cdp -- --restart`: Terminate the running debug browser and start a fresh instance.

### 4. Automate and Verify the Extension UI
Run the default smoke runner:
```bash
pnpm e2e:cdp
```

### 5. Authoring Custom Automated E2E/CDP Tests
When implementing a new feature or reproducing UI bugs, author or extend a CDP automation script following this pattern:

```javascript
import path from "node:path"
import { chromium } from "@playwright/test"

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222")
const context = browser.contexts()[0]

// 1. Locate the extension (CDP Target inspection works even if the service worker is dormant)
const session = await browser.newBrowserCDPSession()
const { targetInfos } = await session.send("Target.getTargets")
const extTarget = targetInfos.find((t) => t.url?.startsWith("chrome-extension://"))
const extensionId = new URL(extTarget.url).hostname
await session.detach()

// 2. Open any extension entrypoint
const page = await context.newPage()
await page.goto(`chrome-extension://${extensionId}/options.html#account`)
await page.waitForLoadState("domcontentloaded")

// 3. Interact with UI primitives via testId or role
const root = page.locator('[data-testid="options-app"]')
await root.waitFor({ state: "attached", timeout: 10000 })

// 4. Inspect or mutate extension storage directly via service worker
// NOTE: Plasmo Storage serializes envelopes as JSON strings (e.g. { accounts: [...] })
const sw = context.serviceWorkers().find((w) => w.url().includes(extensionId))
const accounts = await sw.evaluate(() => {
  return new Promise((resolve) => {
    chrome.storage.local.get("site_accounts", (res) => {
      const data = typeof res.site_accounts === "string" ? JSON.parse(res.site_accounts) : res.site_accounts
      resolve(data?.accounts || [])
    })
  })
})
```

## Developer image previews

For site adaptation or a requested visual handoff, follow [visual previews](../add-site-integration/references/visual-previews.md). Persist screenshots at meaningful asserted states in the site-specific runner, inspect them, and display representative images directly with brief captions. Local developer evidence is raw and unmasked by default, lives outside Git, and uses the shared [evidence storage rules](../add-site-integration/references/evidence-and-validation.md#retain-evidence-while-discovering-it). Keep automatic CI/real-site capture settings unchanged; report missing live access or image-rendering limitations explicitly.

## Multi-Worktree Conventions

1. **Shared Profile**: All worktrees resolve to the same OS-level data folder (`%LOCALAPPDATA%\AllApiHub\dev-browser` on Windows, `~/Library/Application Support/AllApiHub/dev-browser` on macOS). Accounts and cookies persist across branch switches.
2. **Current Branch Targeting**: `scripts/e2e-cdp-control.mjs` checks `process.cwd()` against extension manifest titles to ensure it controls the extension belonging to the active worktree when multiple branches are mounted.
