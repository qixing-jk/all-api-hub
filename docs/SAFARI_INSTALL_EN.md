# Safari Extension Installation Guide

This guide explains how to install the All API Hub extension in Safari browser.

## Quick Difference

- Without a paid Apple Developer Program account: you can still build and enable the extension on your own Mac with Xcode for development or personal use. It is generally not suitable for distribution, and local non-distributed builds may require `Allow Unsigned Extensions` in Safari's Develop menu.
- With a paid Apple Developer Program account: you can properly sign the app/extension and distribute it through TestFlight or the App Store, which is the right path for other users to install it.

## System Requirements

- macOS 11.0 Big Sur or later
- Safari 14.0 or later
- Xcode 13.0 or later (for building)

## Installation Methods

### Method 1: Build from Source (Recommended, works without a paid account)

#### 1. Build the Safari Extension

```bash
# Clone or download the project source
git clone https://github.com/qixing-jk/all-api-hub.git
cd all-api-hub

# Install dependencies
pnpm install

# Build Safari version
pnpm run build:safari
```

After building, the extension files will be in `.output/safari-mv2/` directory.

#### 2. Use Xcode Converter to Create Safari App

```bash
# Run the Safari Web Extension converter
xcrun safari-web-extension-converter /path/to/all-api-hub/.output/safari-mv2/
```

This will:
1. Automatically open Xcode
2. Create a new Xcode project
3. Generate a macOS app (to host the extension)

#### 3. Build and Run in Xcode

1. In Xcode, ensure your Mac is selected as the target device
2. Click Product > Run (or press `Cmd + R`)
3. On first run, Xcode handles signing; without a paid account you can use your `Personal Team` for local testing
4. After successful build, Safari will open and prompt you to install the extension

#### 4. Enable the Extension

1. Open Safari
2. In the menu bar, click `Safari > Settings`
3. If this is a local non-distributed build, enable `Allow Unsigned Extensions` in the `Develop` menu
4. Select the `Extensions` tab
5. Find `All API Hub` and enable it
6. Configure extension permissions as needed

### Method 2: Temporary Debug Loading (Development Only)

Some macOS / Safari versions allow temporary debug loading, but it is not a proper installation or distribution path:

```bash
# Build Safari extension
pnpm run build:safari

# Enable developer mode in Safari
# Safari > Settings > Advanced > Check "Show Develop menu in menu bar"
```

1. Open Safari
2. In the menu bar, click `Develop > Allow Unsigned Extensions`
3. Enable the extension in `Safari > Settings > Extensions`

> **Note**: If this path is unavailable, use the Xcode flow above. Signed distribution should still go through the normal Apple distribution path.

## Development Debugging

### Development Build

```bash
# Development build with hot reload
pnpm run dev -- -b safari
```

### Debugging Extension

1. **Debug background script/popup**:
   - In Safari, right-click the extension icon
   - Select `Inspect` or open Web Inspector

2. **Debug content scripts**:
   - On any webpage, right-click the page
   - Select `Inspect Element`
   - Check extension-related logs in the console

## FAQ

### Q: Why does Safari require special handling?

A: Safari extensions must be packaged as macOS apps for installation and distribution, unlike Chrome/Edge/Firefox which can directly install `.crx` or `.xpi` files.

### Q: What's the difference between having and not having a developer account?

A:
- No paid account: good for local development or personal use on your own Mac, but not proper end-user distribution.
- Paid account: required for proper signing and distribution through TestFlight / App Store.

### Q: Can I install it like Chrome?

A: No. Safari doesn't support normal production-style unpacked installs like Chrome. Local use typically goes through Xcode, while real distribution goes through TestFlight / App Store.

### Q: What if I encounter build errors?

A: Make sure:
- Xcode command line tools are installed: `xcode-select --install`
- Xcode license is accepted: `sudo xcodebuild -license accept`
- Node.js version >= 18

### Q: Are there differences from the Chrome version?

A: Basic functionality is identical. However, due to Safari WebExtensions API limitations, some features may differ:
- `sidePanel` API is not available in Safari (uses popup window instead)
- Some permission request methods may differ

### Q: How do I update the extension?

A: Simply rebuild and run the Xcode project to update the installed extension.

## Uninstallation

1. Open Safari
2. Go to `Safari > Settings > Extensions`
3. Uncheck `All API Hub`
4. Delete the Xcode-generated macOS app

## References

- [Apple Safari Web Extensions Official Documentation](https://developer.apple.com/documentation/safari-extensions/safari-web-extensions)
- [Safari Web Extension Converter Usage](https://developer.apple.com/documentation/safari-extensions/converting-a-web-extension-for-safari)
- [WXT Framework Safari Support](https://wxt.dev/guide/browsers/safari.html)

---

For issues, please report on [GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues).
