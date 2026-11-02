# Installation Channels and Updates

All API Hub has three common installation channels: the **browser store version**, the **self-updating GitHub build (Chromium `.crx`)**, and the **unpacked GitHub build**. If you are not sure which one to choose, use the browser store version first.

::: tip Simple answer
Chrome, Edge, and Firefox users should install the matching store version first. The store build is the simplest install and needs no policy configuration.

Only when the store is not an option (the store has not published the version yet, or your browser cannot install the store or Chrome Web Store compatible build) and you must use a GitHub asset does the form matter for Chromium browsers:

- **Recommended: the `.crx` self-updating build** — it updates from the release manifest just like the store build, so you install it once and stop swapping packages. Stock Chrome / Edge need the extension allowlist policies configured once (no configuration needed on Linux).
- **`.zip` unpacked build** — does not auto-update, so every upgrade needs a fresh download and reload; use it only when the `.crx` cannot be installed.
:::

## Which Version Should I Install?

| Your Situation | Recommended Version | Update Method |
|---|---|---|
| You use Chrome | Chrome Web Store version | Updated automatically by the browser, and you can also check manually inside the extension |
| You use Edge | Edge Add-ons version | Updated automatically by the browser, and you can also check manually inside the extension |
| You use Firefox | Firefox Add-ons version | Updated automatically by Firefox; the extension can also check AMO's published version |
| You use Brave / Vivaldi / Opera and Chrome Web Store works | Chrome Web Store version | Updated automatically through the browser / store |
| You use Brave / Vivaldi / Opera and the store does not work | Try the `.crx` self-updating build first; fall back to the unpacked `.zip` if the `.crx` cannot be installed | `.crx` updates automatically; unpacked builds require re-download |
| You use QQ Browser / 360 Browser / Cheetah Browser or a similar browser | Use the built-in extension center first if available; otherwise try the `.crx`, then the unpacked `.zip` | `.crx` updates automatically; unpacked builds require re-download |
| The store version has not received an urgent fix yet | Temporarily use GitHub Stable | A `.crx` install auto-updates; unpacked builds require a manual download |
| You want to try features that are still in development | Nightly / development build | It may be unstable and is only recommended for testing; the Chromium `.crx` still auto-updates |

If you use QQ Browser, 360 Browser, Cheetah Browser, Brave, Vivaldi, Opera, or a similar browser, see the [Other Browser Installation Guide](./other-browser-install.md). Brave, Vivaldi, and Opera can usually try Chrome Web Store first; when a GitHub install is needed, prefer the `.crx` — see [Chromium self-updating install](./chromium-crx-self-update.md).

::: tip Does my browser count as Chromium?
The listed browsers such as Chrome, Edge, Brave, Vivaldi, and Opera use Chromium. Confirm the engine and extension support for other browsers. Use Firefox Add-ons for Firefox and compatible browsers, and the Safari guide for Safari. See the [browser table](./other-browser-install.md#supported-browsers).
:::

## Why Does GitHub Have a Newer Version Before the Store?

This is normal. The project usually publishes a new version to GitHub first, then submits it to each browser store. Stores still need to review and roll out the update, so they may be behind for a while.

Common reasons include:

- The store is still reviewing the new version.
- The store has approved the version, but has not pushed it to your browser yet.
- Your browser has not checked extension updates yet.
- A company device, browser policy, or network environment is limiting extension updates.

If you use the store version, usually you only need to wait for the browser to update it automatically. If you urgently need a fix, you can try the manual check steps below.

## Check for Updates Inside the Extension

Open the All API Hub settings page and click **Check for updates** in the version area. Before the first check, it shows your current version. Click **Changelog** to read what changed without opening a download page.

Checks follow the current artifact's channel: Firefox Add-ons builds check the version published on AMO, GitHub Release builds check the latest stable release, and Nightly builds compare source commits so an unchanged version number does not hide a new build. Chrome and Edge store builds also ask the browser whether an update is ready. Old or unmarked packages can still check manually; automatic-check support depends on the installation environment.

You may see these results:

- **You’re up to date**: no action is needed. You can read the changelog for version details.
- **Update available**: click **Download update** to open the matching release page or Firefox Add-ons listing. A published AMO version does not mean Firefox has downloaded it.
- **Waiting for the store update**: the browser updates store installs automatically. Wait for the store rollout.
- **Update ready to apply**: the browser has prepared an update. Click **Reload to update** to apply it.
- **Could not check for updates**: the network, GitHub / AMO access, or browser update check may be temporarily unavailable. Try checking again.

::: warning Note
The in-extension check cannot skip browser store review. If GitHub has published a version but the store has not listed it yet, the extension cannot directly update the store version to that release.
:::

## Manually Check Store Updates in the Browser

If you use the Chrome or Edge store version, you can also ask the browser to check extension updates once.

### Chrome

1. Open `chrome://extensions/` in the address bar.
2. Turn on **Developer mode** in the top-right corner.
3. Click **Update** on the page.
4. Wait for the browser to check extension updates.

### Edge

1. Open `edge://extensions/` in the address bar.
2. Turn on **Developer mode**.
3. Click **Update** on the page.
4. Wait for the browser to check extension updates.

This method can only update to a version that the store already provides. If the store is still reviewing the new version, it still will not appear.

### Firefox

Firefox usually updates extensions automatically. You can also open `about:addons`, go to the extensions management page, and check whether updates are available. The button position may vary slightly between Firefox versions.

## When Should I Install from GitHub?

GitHub assets fit these cases:

- The store version has not received a fix that you urgently need.
- Your current browser does not have an available store version and cannot use a compatible store path such as Chrome Web Store.
- You need to help confirm whether a new version fixes an issue.

GitHub assets come in two forms with very different update behavior:

- **Self-updating `.crx` (recommended GitHub asset)**: the browser fetches new versions from the release `updates.xml` automatically, so you never replace the package by hand. Stock Chrome / Edge need the extension allowlist policy configured first (none needed on Linux; Windows Edge also requires a domain-joined device). See [Chromium self-updating install](./chromium-crx-self-update.md).
- **Unpacked `.zip`**: does not auto-update. Every upgrade requires a new download and reload, so use it only when the `.crx` cannot be installed.

Before installing, note that:

- Before switching from the store version to a GitHub build, export a backup. The `.crx`, the `.zip`, and the store build use different extension ids, so data does not migrate automatically.
- It is not recommended to keep multiple All API Hub installations from different sources for long-term use, unless you are intentionally testing.
- Firefox has no self-updating GitHub channel; `*-firefox.zip` does not auto-update either, so use the Firefox Add-ons store build.

For installation and update steps, see the [Other Browser Installation Guide](./other-browser-install.md).

## Frequently Asked Questions

### Do I Need to Keep Clicking "Check for updates"?

No. Store versions and the self-updating `.crx` are both updated automatically by the browser. Only check manually when you see that GitHub has published a newer version, want to confirm whether the store version can already be updated, or want to apply a `.crx` update right away.

### Does "Check for updates" Automatically Download the GitHub Package?

No. It checks version status for the current channel and can open Releases or the store page, but does not automatically download GitHub packages. Unpacked builds require a manual download and update.

### Will "Reload to update" Delete My Data?

No. It only applies a store update that has already been downloaded. Accounts, keys, settings, and other data remain in the browser extension storage.

### GitHub Has a New Version, but the Extension Still Says the Store Has No Update. What Should I Do?

If you use the store version, wait for store review and rollout first. If you urgently need the fix, you can temporarily install the self-updating `.crx` from GitHub Stable. It is recommended to export a backup before doing so.

### How Do I Update a GitHub Install?

- **Self-updating `.crx`**: the browser updates it automatically; you can also click "Update" on `chrome://extensions/` to check immediately.
- **Unpacked `.zip`**: download the new package and load the new extension directory again. For details, see the [Other Browser Installation Guide](./other-browser-install.md#update-extension).

## Related Documentation

- [Get Started](./get-started.md)
- [Other Browser Installation Guide](./other-browser-install.md)
- [Safari Extension Installation Guide](./safari-install.md)
- [Changelog](./changelog.md)
