# Chromium self-updating install (.crx)

This page is for Chromium users who must use a GitHub build. After you install the `.crx`, the browser fetches new versions from the update manifest on the release page, which makes it the recommended GitHub asset over the unpacked `.zip`.

::: tip Check whether you need this
If you can install from the Chrome Web Store, Edge Add-ons, or Firefox Add-ons, use the store build instead: it is the simplest install and needs no policy configuration.

Only when a GitHub asset is unavoidable (the store has not published the version yet, your browser cannot install the store or Chrome Web Store compatible build, or you want Nightly early) do you choose between the two asset forms:

- **Recommended: the self-updating `.crx`** — updates automatically just like the store build, so you install it once and never swap packages by hand.
- Unpacked `.zip` — does not auto-update, so every upgrade needs a fresh download; use it only when the `.crx` cannot be installed.

Stock Chrome / Edge must configure the extension allowlist policies on this page once before installing the `.crx` (none needed on Linux; Windows Edge also requires a domain-joined device).
:::

::: tip Which browsers are Chromium
Chromium browsers such as Google Chrome, Microsoft Edge, Brave, Vivaldi, and Opera can use this guide. For other browsers, confirm the engine and extension support first.

Use Firefox Add-ons for Firefox and compatible browsers; see the [Safari installation guide](./safari-install.md) for Safari.

If you are unsure which category your browser falls into, check the [browser table in the Other Browser Installation Guide](./other-browser-install.md#supported-browsers).
:::

::: warning The unpacked `.zip` does not auto-update
The `all-api-hub-<version>-chrome.zip` from GitHub Releases does not update itself once loaded unpacked — every upgrade needs a fresh download and reload. It also uses a different extension id from the `.crx`, so their data is not shared.
:::

## Why stock Chrome and Edge need extra configuration

Since Chrome 33 (Windows) and Chrome 44 (macOS), Google has progressively blocked browsers from installing extensions outside the Chrome Web Store. Without an administrator-level policy, Chrome will either:

- refuse the `.crx` with `CRX_REQUIRED_PROOF_MISSING`, or
- install it and then disable it as "not from the Chrome Web Store", with no durable way to re-enable it.

When the browser supports self-hosted installation and its device management prerequisites are met, the required policies allow the `.crx` to update through the release manifest. Windows Edge also requires domain membership as described below; importing a policy alone does not meet that requirement.

::: warning Installation source trust
The templates' `ExtensionInstallSources` permits both this project's GitHub pages and GitHub's shared download host, `release-assets.githubusercontent.com`, which also serves assets from other repositories. Both the CRX download URL and the referring page must match an allowed source, but a page under this project's path could still link to another CRX on the shared host.

`ExtensionInstallAllowlist` only exempts listed extensions from a blocklist; it does not restrict installation to this extension. The templates do not set a global `ExtensionInstallBlocklist`, so these source rules grant trust beyond this extension ID. Import only if you accept that scope, and verify the download source and installed extension ID. Ask your administrator to merge existing organizational policies rather than overwriting them.
:::

## Installation

### 1. Download the release asset

Open the [latest release](https://github.com/qixing-jk/all-api-hub/releases/latest) and download:

```text
all-api-hub-chrome.crx
```

The file name carries no version because `releases/latest` always resolves to the newest stable release. Nightly users should download `all-api-hub-nightly-chrome.crx` from the [Nightly release](https://github.com/qixing-jk/all-api-hub/releases/tag/nightly).

::: warning Do not install the ZIP build alongside it
The `.crx` build and the unpacked ZIP build have different extension ids, so their data is not shared. If you already installed the ZIP with "Load unpacked", export a backup, remove the old install, install the `.crx`, then import the backup.
:::

### 2. Allow the browser to install an external extension

#### Linux

No configuration needed. Chromium and Chrome allow self-hosted extensions on Linux.

#### Windows

**Edge device prerequisite:** [Microsoft's documentation](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-manage-extensions-webstore#prerequisites) requires Windows devices to be joined to a Microsoft Active Directory domain. Microsoft Entra joined devices are insufficient unless they are Microsoft Entra hybrid joined. Importing `edge-install-policy.reg` on an ordinary non-domain device does not meet the self-hosted installation requirements; use the Edge Add-ons build instead.

Write an administrator-level registry policy. Ready-made templates live in `resources/crx-self-update/`: `chrome-install-policy.reg` for Chrome, `edge-install-policy.reg` for Edge. The templates already carry this extension's id; import the file from an administrator shell, then fully quit and restart the browser.

The templates carry these two policies:

```reg
Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\ExtensionInstallAllowlist]
"1"="oligofghjlogjhmnhnhccnobbginfgmp"

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\ExtensionInstallSources]
"1"="https://github.com/qixing-jk/all-api-hub/*"
"2"="https://release-assets.githubusercontent.com/*"
```

Edge users should replace both `Google\Chrome` segments with `Microsoft\Edge`.

The id `oligofghjlogjhmnhnhccnobbginfgmp` is derived from the signing public key and matches the `appid` in the release's `updates.xml`; you can also confirm it on the extensions page after installing.

#### macOS

Deploy the same policies (`ExtensionInstallAllowlist`, `ExtensionInstallSources`) through MDM or a configuration profile. Templates are provided as `resources/crx-self-update/chrome-install-policy.mobileconfig` and `edge-install-policy.mobileconfig`; push them through MDM or double-click to install as a system profile. Editing only a user-level plist is not treated as a forced policy, and the browser ignores it.

### 3. Install and confirm

1. Open `chrome://extensions/` (or `edge://extensions/`) and enable developer mode.
2. Drag the downloaded `.crx` onto the extensions page and confirm the install.
3. Check that the extension card does not report "not from the Chrome Web Store".

### 4. Verify automatic updates

The browser checks `update_url` every few hours. To check immediately:

1. Open `chrome://extensions/`.
2. Click the "Update" button on the page.
3. When a newer version exists, the extension version changes.

You can also click "Check for updates" in **Settings → About** inside All API Hub. A self-updating install reports "the browser will install it automatically" instead of offering a ZIP download.

## FAQ

### It says "not from the Chrome Web Store" and the extension is disabled

The policy did not take effect. Confirm the registry entry lives under `HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome` (or the `Wow6432Node` path on 64-bit systems) and that the value type is a string. Fully quit the browser after the change.

### It reports `CRX_REQUIRED_PROOF_MISSING`

This is the same missing or ineffective policy. The error means Chrome cannot verify where the package came from; configuring `ExtensionInstallAllowlist` and `ExtensionInstallSources` clears it.

### The update never arrives

- The browser only reads `update_url` at startup and on its periodic check, so a long-running session delays it.
- A managed or corporate device may override extension policies.
- Nightly `.crx` builds use a browser version derived from UTC build time (`year.monthday.hourminute.secondmillisecond`, for example `2026.1026.459.59999`), while the display name retains the package version. The browser compares this numeric version; the extension's update reminder compares build commits.
- To switch from the Nightly `.crx` to the Stable `.crx`, export a backup, uninstall, then install and restore the backup. Both use the same signing ID, but Stable has a lower version number and cannot replace Nightly directly.

### How do I go back to the store build?

Export a backup, uninstall the `.crx` build, install from the store, then import the backup. The two builds have different extension ids, so their data does not migrate automatically.

## Related documentation

- [Installation channels and updates](./extension-update-install.md)
- [Installing in other browsers](./other-browser-install.md)
- [Safari installation guide](./safari-install.md)
