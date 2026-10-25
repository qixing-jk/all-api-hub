# Chromium self-updating install (.crx)

This page is for Chromium users who want to keep using the GitHub build without replacing the package by hand every time. After you install the `.crx`, the browser fetches new versions from the update manifest on the release page.

::: tip Check whether you need this
If you can install from the Chrome Web Store, Edge Add-ons, or Firefox Add-ons, use the store build instead. The browser updates it automatically and no configuration is required.

A self-updating install only makes sense when at least one of these is true:

- You use Chromium or Chrome on Linux.
- You use a Chromium fork such as QQ Browser, a 360 browser, Brave, or Vivaldi that allows external extensions.
- You are willing to configure an extension allowlist once on stock Chrome or Edge.
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
