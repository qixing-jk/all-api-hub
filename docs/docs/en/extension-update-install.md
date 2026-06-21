# Installation Channels and Updates

All API Hub has two common installation channels: the **browser store version** and the **GitHub manual installation version**. If you are not sure which one to choose, use the browser store version first.

::: tip Simple answer
Chrome, Edge, and Firefox users should install the matching store version first. Store versions are updated automatically by the browser and are the easiest to maintain. Only consider manual installation from GitHub when the store has not received an update yet, your browser cannot install the store version, or you need to temporarily verify a fix.
:::

## Which Version Should I Install?

| Your Situation | Recommended Version | Update Method |
|---|---|---|
| You use Chrome | Chrome Web Store version | Updated automatically by the browser, and you can also check manually inside the extension |
| You use Edge | Edge Add-ons version | Updated automatically by the browser, and you can also check manually inside the extension |
| You use Firefox | Firefox Add-ons version | Updated automatically by Firefox |
| You use QQ Browser, 360 Browser, Brave, Vivaldi, Opera, or a similar browser | GitHub Chrome package | You need to download new versions manually later |
| The store version has not received an urgent fix yet | Temporarily use GitHub Stable | You need to download new versions manually later |
| You want to try features that are still in development | Nightly / development build | It may be unstable and is only recommended for testing |

If you need to load the extension manually in QQ Browser, 360 Browser, Brave, Vivaldi, Opera, or a similar browser, see the [installation guide for QQ / 360 and other browsers](./other-browser-install.md).

## Why Does GitHub Have a Newer Version Before the Store?

This is normal. The project usually publishes a new version to GitHub first, then submits it to each browser store. Stores still need to review and roll out the update, so they may be behind for a while.

Common reasons include:

- The store is still reviewing the new version.
- The store has approved the version, but has not pushed it to your browser yet.
- Your browser has not checked extension updates yet.
- A company device, browser policy, or network environment is limiting extension updates.

If you use the store version, usually you only need to wait for the browser to update it automatically. If you urgently need a fix, you can try the manual check steps below.

## Check for Updates Inside the Extension

Open the All API Hub settings page, then click **Check now** in the version and update area.

The extension checks two things for you:

1. Whether the project has published a newer stable version on GitHub.
2. Whether your browser store version can already be updated.

You may see these results:

- **Already on the latest stable version**: no action is needed.
- **A newer version is available**: GitHub already has a newer version. If you use the store version, you may still need to wait for store review or rollout.
- **Store update is ready**: your browser has already downloaded the new version. Click **Reload to update** to apply it.
- **Check failed**: the network, GitHub access, or the browser update check may be temporarily unavailable. Try again later.

::: warning Note
The in-extension check cannot skip browser store review. In other words, if GitHub has published a version but the store has not listed it yet, the extension cannot directly update the store version to that release.
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

## When Should I Install Manually from GitHub?

Manual installation from GitHub is best used temporarily:

- The store version has not received a fix that you urgently need.
- Your current browser does not have an available store version.
- You need to help confirm whether a new version fixes an issue.

Before installing manually, note that:

- Manually installed versions usually do not update automatically.
- Future upgrades require downloading the new package again. You can Star / Watch the GitHub repository so it is easier to notice new releases.
- Before switching from the store version to a manually installed version, it is recommended to export a backup of your data.
- It is not recommended to keep multiple All API Hub installations from different sources for long-term use, unless you are intentionally testing.

For manual installation and update steps, see the [installation guide for QQ / 360 and other browsers](./other-browser-install.md).

## Frequently Asked Questions

### Do I Need to Keep Clicking "Check now"?

No. Store versions are updated automatically by the browser. Only check manually when you see that GitHub has published a newer version, or when you want to confirm whether the store version can already be updated.

### Does "Check now" Automatically Download the GitHub Package?

No. It only shows the version status and asks the browser to check whether the store version can be updated. GitHub packages still need to be downloaded manually from the Releases page.

### Will "Reload to update" Delete My Data?

No. It only applies a store update that has already been downloaded. Accounts, keys, settings, and other data remain in the browser extension storage.

### GitHub Has a New Version, but the Extension Still Says the Store Has No Update. What Should I Do?

If you use the store version, wait for store review and rollout first. If you urgently need the fix, you can temporarily install GitHub Stable manually. It is recommended to export a backup before doing so.

### How Do I Update a Manually Installed Version?

Download the new package and load the new extension directory again. For details, see the [installation guide for QQ / 360 and other browsers](./other-browser-install.md#update-extension).

## Related Documentation

- [Get Started](./get-started.md)
- [Installation Guide for QQ / 360 and Other Browsers](./other-browser-install.md)
- [Safari Extension Installation Guide](./safari-install.md)
- [Changelog](./changelog.md)
