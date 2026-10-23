# Desktop dev recovery

## Identify the current worktree's server

Read `.scratch/wxt-dev.log`, the launch output, and `.output/chrome-mv3-dev/options.html` in the checkout being tested. Probe the generated server URL's `/@vite/client`; the root `/` can legitimately return 404. Diagnose proxy interception of loopback CDP separately from WXT readiness, using an invocation-scoped proxy bypass when indicated.

The launcher can accept the first Vite response on ports 3000–3005 without establishing worktree ownership. If the generated URL is unreachable but another port responds, inspect the listener's PID, command line and working directory where available, together with this checkout's WXT log/PID. A Vite response or a visible Options shell alone does not resolve the mismatch.

For a mismatched server, select a verified free dev-server port and launch from the intended checkout:

```bash
pnpm browser:cdp:isolate -- --dev --dev-port <free-port>
```

Use the existing profile configuration instead of `:isolate` when it is already appropriate; preserve the corresponding CDP port/profile settings in the runner. `--dev-port` selects WXT's port, independently of the browser's CDP port. Let the launcher manage the background process; piping a long-running `pnpm dev` into `head` can terminate it.

Confirm the regenerated `options.html` embeds the chosen server URL, discover the extension from this checkout's absolute dev output path, require the Options app and affected controls to render, and verify an actual edit reaches that UI before relying on HMR. If the existing browser cannot load the selected extension, diagnose the reported loading error before considering a task-owned browser restart.

Preserve other worktrees' processes. `--stop-dev` can fall back to stopping a listener on port 3000 when its PID record is missing or unusable; establish ownership before stopping anything. Record the failed URL, selected process/path, recovery command and outcome. A remaining concrete error after this diagnosis can justify a production fallback, reported as dev/HMR unverified.

## Reload the selected background

After WXT has compiled a background change, first check whether its automatic reload already delivered the new behavior. If an explicit reload is needed, use `pnpm browser:cdp -- --dev --reload` (or `browser:cdp:isolate` with the existing isolated profile configuration). For a verified, installed production build use `--prod --reload`. The launcher resolves the chosen output path to an enabled extension ID, waits for any active old worker to close, and verifies a replacement worker answers with that runtime ID and handles the existing read-only `getInternalTabIds` message with an empty list. It refreshes only the selected extension's pages, restoring their URLs if the browser closed them. If the old background is dormant, it invokes reload from that extension's temporary Options page; opening Options alone need not start a worker. Temporary pages are cleaned up before completion. A missing installation or a failed replacement startup returns an error instead of reporting success or reloading another extension. This confirms the root message listener can respond; validate the affected background feature separately, since later service initialization can still fail.

For custom CDP orchestration or diagnosis of a reload failure:

1. Connect with `connectDevBrowser`, resolve the ID through `findInstalledDevExtension(browser, absoluteDevOutputPath)`, then connect with `connectExtensionById({ extensionId })`, retaining the same CDP/profile configuration.
2. Check that the selected worker URL and its `chrome.runtime.id` match that ID. Observe its lifecycle, then invoke `chrome.runtime.reload()` inside that worker. Context destruction can interrupt the evaluation; determine completion from the worker lifecycle and subsequent behavior, not that exception alone.
3. Discard old worker/page handles and reconnect to the same ID. Wake it through its own Options page if needed, use bounded waits for the replacement worker and rendered app, and fail with the observed error if readiness does not arrive. The connection helper's short wake delay alone is not proof that a new worker is ready.
4. Exercise the changed message or action through the selected extension and assert the expected response or resulting state; read persistence back when applicable. A ready worker or a successful reload log alone does not verify the change. Existing site tabs need separate content-script verification when affected.

This does not require a production build or a browser restart. Keep any temporary CDP orchestration local to the task and reuse the repository's connection helpers; report a missing behavior assertion or unsuccessful reload as unverified.
