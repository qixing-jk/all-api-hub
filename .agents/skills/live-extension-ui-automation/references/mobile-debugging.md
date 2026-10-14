# Android extension debugging and hot updates

Use the repo CLI rather than rebuilding socket discovery or reusing remembered device serials, forwarded ports, target IDs, or dev extension IDs. Run from the current checkout. `node scripts/mobile-browser.mjs --help` describes the available options; `pnpm browser:mobile` is the package-script alias.

Local tooling uses the shared `.env.local` loader, including `ADB_PATH`. See [local tooling configuration](../../../../CONTRIBUTING.md#local-tooling-environment-configuration).

## Choose diagnostics or development

Native CDP (Edge/Lemur) and RDP (Firefox) can execute extension-context JavaScript in an installed release when that browser exposes its targets. Developer mode is not itself an execution permission. This is extension JavaScript, not an arbitrary phone shell or a guarantee that an injected Chii evaluator bypasses CSP.

For an installed-version bug, start with discovery, read-only evaluation, logs, and screenshots. Start `dev` when validating checkout changes or hot updates. Reloading installed code does not deploy new source. Keep account mutations within the user's task; a diagnostic session does not authorize unrelated writes.

## Discover and inspect

```bash
node scripts/mobile-browser.mjs devices
node scripts/mobile-browser.mjs inspect --browser lemur --device SERIAL
node scripts/mobile-browser.mjs eval --browser lemur --device SERIAL --context options --expression 'JSON.stringify({id:chrome.runtime.id,version:chrome.runtime.getManifest().version})'
node scripts/mobile-browser.mjs logs --browser lemur --device SERIAL --context options --duration 10000
node scripts/mobile-browser.mjs screenshot --browser lemur --device SERIAL --output .scratch/mobile.png
node scripts/mobile-browser.mjs reload --browser lemur --device SERIAL
```

Use direct Node invocation for machine-readable stdout: diagnostics emit JSON or JSONL, errors emit JSON on stderr and exit nonzero. Use `--file .scratch/probe.js` for longer expressions instead of embedding complex code in shell quoting. Firefox uses `browser.runtime`; stringify object results for portable values instead of relying on RDP object grips. Chromium logs include browser security errors (`Log.entryAdded`), which can explain a blank page without a JS exception.

Pin `--device` with multiple phones and `--package` when selecting a browser channel. Keep that browser in the foreground; backgrounding can leave a socket present but unresponsive. Firefox requires USB remote debugging. No socket or no authorized device is a connection blocker, not evidence of incompatibility.

Select the requested extension and context. For a dev CRX, pass `--extension` with the ID emitted by `dev`. When several options pages exist, use `--target` from a fresh `inspect`; do not choose the first arbitrary tab. An absent worker may be dormant. Open the extension UI, or evaluate `runtime.openOptionsPage()` in its available background target. Native browser CDP `Target.createTarget` can open its exact `chrome-extension://ID/options.html` URL when no extension context is available; verify the resulting target belongs to that ID.

## Deploy checkout changes

Firefox: run `dev --browser firefox --device SERIAL`. This starts WXT and `web-ext`, restarts Firefox, installs a temporary addon, and watches output. Restarting Firefox ends the temporary installation. Verify the target's runtime version/name and loaded UI after deployment rather than assuming the previous addon remains active. `pnpm dev:mobile:firefox` is a compatibility alias. Android Firefox CSS hot updates were verified; other changes may reload the addon.

```bash
node scripts/mobile-browser.mjs dev --browser firefox --device SERIAL
node scripts/mobile-browser.mjs dev --browser edge --device SERIAL --port PORT
```

Edge/Lemur: run `dev --browser BROWSER --device SERIAL --port PORT` and retain its process. Read the emitted CRX path, phone path, and extension ID. The signing key under `.scratch/mobile-dev/<browser>/` preserves that installation's ID; do not substitute a remembered ID from another checkout or browser artifact. Keep a fixed port when reusing a package because its HTML embeds that port. Rebuilding/reinstalling is required when the port, background, or manifest changes. The CRX is copied to the phone's Download directory. Packing requires Playwright Chromium (`pnpm exec playwright install chromium`). `dev` runs until Ctrl+C or the optional `--duration MILLISECONDS` deadline.

Use the browser's supported installer. The independent dev ID preserves the store installation. If the new addon is disabled, inspect its enable/permission prompt. Installation success does not establish that its UI or hot updates work.

| Browser verified | Install route | Verification completed |
| --- | --- | --- |
| Edge Canary 157.0.4329.0 | Settings → Developer options → Extension install by crx | CRX installation, UI rendering, CSS updates, JS module HMR |
| Lemur 2.7.5.009 (Chromium 127) | `chrome://extensions` → Developer mode → Load unpacked (accepts CRX in this version) | CRX installation, UI rendering, CSS updates, JS module HMR |

These results apply to the tested versions; installer restrictions may differ.

When automating Android UI, inspect the current foreground package and UI state before each action batch, especially after a picker or dialog transition. Derive clicks from the current hierarchy rather than old coordinates. If the user is using another app, coordinate a brief foreground window instead of clicking through that app. Use the normal UI when an internal activity is not exported. If a file picker cannot find an ADB-pushed CRX, browse the actual shared-storage directory and refresh it; a virtual Downloads view may not list the same files.

## Enable and prove Chromium UI hot updates

Packed MV3 installs can block WXT's localhost modules despite the dev manifest. Check `logs` for CSP errors. After opening the dev options page, run a second session with the freshly discovered IDs:

```bash
node scripts/mobile-browser.mjs dev-ui --browser BROWSER --device SERIAL --extension DEV_ID --target TARGET_ID
```

This verifies the WXT dev page, enables native CDP CSP bypass for that page, and reloads it. Keep both `dev` and `dev-ui` alive. The bypass is restored on exit; `dev-ui` defaults to ten minutes and accepts `--duration`. It rejects release pages. No broad CSP or release-manifest changes are needed for this flow.

Confirm the expected UI has rendered, then change a reversible source probe and read its changed value on the same phone target without manually refreshing it. A CSS custom property proves CSS updates; an imported Vite module accepting an HMR update proves JS module updates. Do not label CSS-only evidence as React Fast Refresh or background hot reload. Preserve the original source bytes and restore them in `finally`; remove only probe files created by this session. Record browser/package/version, dev ID, context, and observed before/after values.

Stop owned sessions with Ctrl+C and check that their ADB mappings are released. Never remove all forwards/reverses or terminate another worktree's server. Report whether dev processes remain running and whether temporary addons or independent dev CRXs remain installed. Distinguish execution, UI loading, CSS updates, JS module updates, and packaged-code redeployment in the final result.
