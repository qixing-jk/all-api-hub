# Other Browser Installation Guide

This document explains how to install the All API Hub extension in browsers such as QQ Browser, 360 Secure Browser, 360 Speed Browser, Cheetah Browser, Brave, Vivaldi, and Opera.

Most of these browsers are based on Chromium, but their available installation paths are not identical. When a browser store or Chrome Web Store installation works, use the store build first. Use the Chrome package from GitHub Releases only when the store path is unavailable, blocked by policy, or needed for temporary verification.

## Differences at a Glance

- **Chrome / Edge / Firefox users:** Prioritize using the official store versions for easier updates.
- **Brave / Vivaldi users:** Try Chrome Web Store first. These browsers officially support Chrome Web Store extensions.
- **Opera users:** Opera has its own Opera Add-ons store, but All API Hub is not currently listed there. Try Chrome Web Store first; if your Opera version or policy does not allow it, use the GitHub manual package.
- **QQ Browser, 360 Series Browsers, Cheetah Browser, and similar users:** If the browser's built-in extension center does not offer All API Hub, use the GitHub Chrome package and install it with "Load unpacked extension."
- **Safari users:** Installation is different and requires Xcode or a Safari-specific package. Please refer to the [Safari Extension Installation Guide](./safari-install.md).
- **Mobile Browsers:** Support for extensions varies significantly across mobile browsers. For mobile usage instructions, please see [Mobile Browser Support in FAQ](./faq.md#mobile-browser-support).

::: warning Tip
Extensions loaded manually are typically not updated automatically. For future updates, you will need to re-download the new Chrome package and click "Reload" or reinstall from the extension management page.
:::

## Supported Browsers

| Browser | Preferred installation | Fallback installation | Update method |
|---|---|---|---|
| Brave | [Chrome Web Store](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | GitHub Chrome package, loaded manually from `brave://extensions/` | Store builds update automatically; manual builds require re-download |
| Vivaldi | [Chrome Web Store](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | GitHub Chrome package, loaded manually from `vivaldi://extensions/` | Store builds update automatically; manual builds require re-download |
| Opera | [Chrome Web Store](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo); All API Hub is not currently listed in Opera Add-ons | GitHub Chrome package, loaded manually from `opera://extensions/` | Chrome Web Store builds are usually updated through browser / store mechanisms; manual builds require re-download |
| QQ Browser | Use the built-in extension center first if it offers All API Hub | `qqbrowser://extensions`, or `chrome://extensions/` if unavailable, then enable Developer mode and load the unpacked directory | Depends on the installation source; manual builds require re-download |
| 360 Secure Browser / 360 Speed Browser | Use the built-in extension / app center first if it offers All API Hub | `chrome://extensions/`, or Extensions / Plugin Management in the menu, then enable Developer mode and load the unpacked directory | Depends on the installation source; manual builds require re-download |
| Cheetah Browser | Use the built-in extension center first if it offers All API Hub | `liebao://extensions/`, then enable Developer mode and load the unpacked directory | Depends on the installation source; manual builds require re-download |
| Starry Wish / Percent / Cent Browser, etc. | If the browser supports Chrome Web Store, try the store first | Try `chrome://extensions/` and load the unpacked directory manually | Depends on the installation source; manual builds require re-download |
| Mobile Kiwi / Edge, etc. | Depends on the browser's actual extension entry point | See [Mobile Browser Support in FAQ](./faq.md#mobile-browser-support) | Depends on browser support |

If a browser cannot use a store install and also lacks "Developer mode" or "Load unpacked extension," the current version may not support installing external extensions. In that case, switch to Chrome, Edge, Firefox, or try the full/desktop version of that browser.

::: tip Store availability is separate from All API Hub listing status
A browser can have its own extension store without All API Hub being listed there. For example, Opera has Opera Add-ons, but currently you should use Chrome Web Store or the GitHub manual package.
:::

## Preparing the GitHub Manual Package

If you can install directly from Chrome Web Store, Edge Add-ons, or Firefox Add-ons, you do not need this section. These steps are only for browsers that need manual loading.

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

## Manual Loading Procedure for Other Desktop Browsers

This applies to desktop browsers that cannot use a store build but can still load a Chrome extension directory.

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

These browsers can usually use Chrome Web Store. First open the [All API Hub Chrome Web Store page](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) in the target browser and try installing from there.

- Brave officially supports installing extensions from Chrome Web Store.
- Vivaldi officially supports Chrome Web Store extensions. If the install button does not appear, check Vivaldi's Google Extensions / Web Store setting.
- Opera has Opera Add-ons and also supports Chrome extensions. All API Hub is not currently listed in Opera Add-ons, so use Chrome Web Store first.

If store installation fails, manually load the GitHub Chrome package from the extension management page:

| Browser | Extension Management Page |
|---|---|
| Brave | `brave://extensions/` |
| Vivaldi | `vivaldi://extensions/` |
| Opera | `opera://extensions/` |
| Other Chromium Browsers | Try `chrome://extensions/` first |

Once on the extension management page, follow the [manual loading procedure](#desktop-browser-common-flow) to enable Developer mode and load the unpacked directory.

<a id="update-extension"></a>

## Updating the Extension

Manually loaded versions do not update automatically. For the differences between store versions, GitHub Stable, and Nightly, read [Installation Channels and Updates](./extension-update-install.md) first. To update a manually loaded version, follow these steps:

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

For Chromium browsers that need manual loading, download:

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
- [Installation Channels and Updates](./extension-update-install.md)
- [Permissions Management (Optional Permissions)](./permissions.md)
- [Safari Extension Installation Guide](./safari-install.md)

## Resources

- [Microsoft Edge Official Documentation: Loading Extensions Locally (Reference for General Chrome Extension Process)](https://learn.microsoft.com/microsoft-edge/extensions-chromium/getting-started/extension-sideloading)
- [Brave Help Center: Installing extensions from Chrome Web Store](https://support.brave.com/hc/en-us/articles/360017909112-How-can-I-add-extensions-to-Brave-)
- [Vivaldi Help: Using Extensions in Vivaldi](https://help.vivaldi.com/desktop/appearance-customization/extensions)
- [Opera Official Blog: Using Chrome extensions in Opera](https://blogs.opera.com/tips-and-tricks/2021/10/using-addons-from-chrome-in-opera)
- [360 Secure Browser Help Center: Extension Applications](https://browser.360.cn/se/help/extension.html)

---

If you encounter any issues, please report them in [GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues).
