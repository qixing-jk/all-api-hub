# Installation Guide for QQ / 360 and Other Browsers

This document explains how to install the All API Hub extension in browsers such as QQ Browser, 360 Secure Browser, 360 Speed Browser, Cheetah Browser, Brave, Vivaldi, and Opera.

Most of these browsers are based on the Chromium engine, so you can typically install them by downloading the Chrome version package from GitHub Releases and using the "Load unpacked extension" option.

## Differences at a Glance

- **Chrome / Edge / Firefox users:** Prioritize using the official store versions for easier updates.
- **QQ Browser, 360 Series Browsers, Cheetah Browser, Brave, Vivaldi, Opera users:** Usually do not have dedicated store versions. It is recommended to download the Chrome version package from GitHub Releases and install it via "Load unpacked extension."
- **Safari users:** Installation is different and requires Xcode or a Safari-specific package. Please refer to the [Safari Extension Installation Guide](./safari-install.md).
- **Mobile Browsers:** Support for extensions varies significantly across mobile browsers. For mobile usage instructions, please see [Mobile Browser Support in FAQ](./faq.md#mobile-browser-support).

::: warning Tip
Extensions loaded manually are typically not updated automatically. For future updates, you will need to re-download the new Chrome package and click "Reload" or reinstall from the extension management page.
:::

## Supported Browsers

| Browser | Extension Management Page Entry | Installation Notes |
|---|---|---|
| QQ Browser | `qqbrowser://extensions`, try `chrome://extensions/` if unavailable | Enable Developer mode and load the unpacked directory; the entry might be in Extension Management or Application Center. See [QQ Browser Installation](#qq-browser) for details. |
| 360 Secure Browser / 360 Speed Browser | `chrome://extensions/`, or Extensions / Plugin Management in the menu | Ensure the target webpage is using Speed Mode before loading the unpacked directory; security policies might block direct drag-and-drop installation. See [360 Series Browser Installation](#browser-360) for details. |
| Cheetah Browser | `liebao://extensions/` | Enable Developer mode and load the unpacked directory; if prompted about homepage/tab changes, prioritize keeping current settings. See [Cheetah Browser Installation](#liebao-browser) for details. |
| Brave / Vivaldi / Opera | `brave://extensions/`, `vivaldi://extensions/`, `opera://extensions/` | These browsers usually retain Developer mode and the "Load unpacked" option. Follow the [General Procedure for Other Desktop Browsers](#desktop-browser-common-flow) for installation. |
| Starry Wish / Percent / Cent Browser, etc. | Try `chrome://extensions/` first | If the extension management page supports "Developer mode" and "Load unpacked extension," you can usually try installing; otherwise, consider switching to Chrome / Edge / Firefox. |
| Mobile Kiwi / Edge, etc. | Depends on the browser's actual extension entry point | Mobile devices have more limitations, and support varies with browser versions. If you cannot find an entry point for installing external extensions, consider using a desktop browser. |

If your browser's extension management page lacks "Developer mode" or "Load unpacked extension," it may indicate that the current version does not support manual installation of external extensions. In such cases, it is recommended to switch to Chrome, Edge, Firefox, or install the full/desktop version of the browser before trying again.

## Preparing the Installation Package

1. Open the [Latest Release](https://github.com/qixing-jk/all-api-hub/releases/latest).
2. Download the Chrome version package from the attachments:

```text
all-api-hub-<version>-chrome.zip
```

For example:

```text
all-api-hub-3.32.0-chrome.zip
```

3. Extract the compressed file to a fixed directory, for example, `D:\Extensions\all-api-hub\`.
4. Ensure that the `manifest.json` file is directly visible within the chosen extension directory.

::: tip Directory Selection
When loading an extension, select the directory that directly contains `manifest.json`. If you encounter errors like "Missing manifest.json" or "manifest.json not found," you have likely selected an outer parent directory.
:::

<a id="desktop-browser-common-flow"></a>

## General Procedure for Other Desktop Browsers

This applies to most desktop browsers that support Chrome extensions.

1. Open the browser's extension management page.
   - Try entering `chrome://extensions/` in the address bar first.
   - If it doesn't work, navigate to `Extensions`, `Extensions`, `Plugin Management`, or `Application Management` through the browser menu.
2. Enable `Developer mode`.
3. Click `Load unpacked extension`.
4. Select the directory you extracted earlier that contains `manifest.json`.
5. After installation, confirm that `All API Hub` is enabled in the extension list.
6. If the icon is not visible in the toolbar, pin All API Hub to the toolbar using the extension icon.
7. If you had the transfer station page open before installation, refresh these pages before using the automatic recognition feature.

<a id="qq-browser"></a>

## QQ Browser Installation

QQ Browser desktop version typically supports manual loading of the Chrome version package.

### 1. Access the Extension Management Page

Choose one of the following methods:

- Enter `qqbrowser://extensions` in the address bar.
- If the above address is not available, try `chrome://extensions/`.
- Navigate to `Extensions`, `Extensions`, or `Application Center` through the top-right menu, then open `Manage Extensions`.

### 2. Enable Developer Mode

Find the `Developer mode` toggle on the extension management page and enable it. The location of this option may vary by version, appearing in the top-right corner, at the bottom of the page, or within an "Advanced Management" section.

### 3. Load the Extension Directory

1. Click `Load unpacked extension`.
2. Select the extracted `all-api-hub-<version>-chrome` directory.
3. After installation, ensure the extension is enabled.

### 4. Common Troubleshooting

- **If "Developer mode" is not present:** The current QQ Browser version might restrict external extension installation. Consider upgrading to the latest desktop full version or switching to Chrome/Edge.
- **If prompted "Not from QQ Browser Store":** Prioritize using "Load unpacked extension" and avoid directly dragging the compressed file.
- **If the extension is installed but not recognized:** Refresh the target transfer station page and ensure it's not in browser compatibility mode or a special security mode.

<a id="browser-360"></a>

## 360 Series Browser Installation

Both 360 Secure Browser and 360 Speed Browser may support Chromium extensions, but the entry point names and security prompts can change with versions.

### 1. Ensure Speed Mode is Used

360 Secure Browser has different rendering engine modes, such as "Speed Mode / Compatibility Mode." All API Hub is a Chromium extension, so it's recommended to use Speed Mode when visiting sites where you need extension recognition.

If you see an engine switching icon (like a `lightning bolt` or `e`) near the address bar, switch to `Speed Mode` before using the extension.

### 2. Access the Extension Management Page

Choose one of the following methods:

- Enter `chrome://extensions/` in the address bar.
- Navigate to `Extensions`, `Extension Management`, `Plugin Management`, or `Application Management` through the top-right menu.
- If there's an "Advanced Management" option, enter it first to enable developer-related settings.

### 3. Enable Developer Mode and Load

1. Enable `Developer mode`.
2. Click `Load unpacked extension`.
3. Select the extracted `all-api-hub-<version>-chrome` directory.
4. After installation, enable All API Hub and pin it to the toolbar as needed.

### 4. Common Troubleshooting

- **If browser security policies block external extensions:** Continue using the "Load unpacked" method and avoid directly dragging `.zip` or `.crx` files.
- **If the extension is disabled after restarting the browser:** Manually enable it from the extension management page. If it remains disabled, consider switching to Chrome/Edge or checking your browser's security policies.
- **If the extension is ineffective on certain web pages:** Ensure the page is not in compatibility mode and refresh pages that were open before installation.

<a id="liebao-browser"></a>

## Cheetah Browser Installation

Cheetah Browser allows manual loading of the Chrome version package through its built-in extension management page.

### 1. Access the Extension Management Page

Enter the following in the address bar:

```text
liebao://extensions/
```

If this address is not available, navigate to `Extensions`, `Extensions`, or `Plugin Management` through the browser menu.

### 2. Enable Developer Mode

Enable `Developer mode` on the extension management page.

### 3. Load the Extension Directory

1. Click `Load unpacked extension`.
2. Select the extracted `all-api-hub-<version>-chrome` directory.
3. After installation, confirm that the extension is enabled.

### 4. Common Troubleshooting

- **If the browser prompts "Change this page is your intention?":** Prioritize selecting "Keep current settings" to prevent the browser from altering your homepage or tab settings.
- **If the extension is installed but not working:** Refresh the target website pages that were open before installation.
- **If Developer Mode or the loading option is not found in the current version:** Consider upgrading your Cheetah Browser desktop version or switching to Chrome/Edge.

## Brave / Vivaldi / Opera Installation

These browsers typically retain Chromium's extension management page, with slightly different internal addresses:

| Browser | Extension Management Page |
|---|---|
| Brave | `brave://extensions/` |
| Vivaldi | `vivaldi://extensions/` |
| Opera | `opera://extensions/` |
| Other Chromium Browsers | Try `chrome://extensions/` first |

Once on the extension management page, follow the [General Procedure for Other Desktop Browsers](#desktop-browser-common-flow) to enable Developer mode and load the unpacked directory.

## Updating the Extension

Manually loaded versions do not update automatically. To update, follow these steps:

1. Open the [Latest Release](https://github.com/qixing-jk/all-api-hub/releases/latest).
2. Download the new `all-api-hub-<version>-chrome.zip`.
3. Extract it to the original fixed directory or to a new version-specific directory.
4. Open the extension management page.
5. If you are using the original directory, click `Reload` on the All API Hub card.
6. If you are using a new directory, first remove the old version, then load the new directory.

::: warning Note
Do not place the extension directory in system temporary folders, download cache directories, or directories of software that might be cleaned up. If the directory is deleted or moved, the browser will be unable to load the extension.
:::

## Uninstalling

1. Open the browser's extension management page.
2. Find `All API Hub`.
3. Click `Remove`, `Uninstall`, or disable the toggle switch.
4. Delete the local extracted directory.

## Frequently Asked Questions

### Should I download the Chrome package or the Firefox/Safari package?

For browsers like QQ Browser, 360 Series Browsers, Cheetah Browser, Brave, Vivaldi, and Opera, you should download:

```text
all-api-hub-<version>-chrome.zip
```

Do not download Firefox's `.xpi` / Firefox package or Safari's Xcode bundle.

### Can I install the `.zip` file directly?

Generally not recommended. Please extract the file first, then use `Load unpacked extension` to select the directory containing `manifest.json`.

### Why does automatic recognition fail after successful installation?

Common reasons include:

- The target website page was opened before installation; you need to refresh the page.
- The login session for the target site has expired; you need to log in again in the same browser.
- The browser is in compatibility mode or security mode, preventing the Chromium extension from injecting into the page.
- The current browser has incomplete support for extension APIs. Try reproducing the issue in Chrome/Edge for confirmation.

### What if the sidebar entry is unavailable?

Some browsers do not support the sidebar capabilities of Chrome/Edge. In such cases, you can use the extension popup or settings page for account management. Core functionalities do not rely on the sidebar.

## Related Documentation

- [Get Started](./get-started.md)
- [FAQ](./faq.md)
- [Permissions Management (Optional Permissions)](./permissions.md)
- [Safari Extension Installation Guide](./safari-install.md)

## Resources

- [Microsoft Edge Official Documentation: Loading Extensions Locally (Reference for General Chrome Extension Process)](https://learn.microsoft.com/microsoft-edge/extensions-chromium/getting-started/extension-sideloading)
- [360 Secure Browser Help Center: Extension Applications](https://browser.360.cn/se/help/extension.html)
- [zTab Documentation: Cheetah Browser Extension Installation Example](https://docs.ztab.ink/browser-extension/liebao.html)

---

If you encounter any issues, please report them in [GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues).