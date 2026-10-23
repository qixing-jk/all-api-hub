# Install the Safari Extension

This guide explains how to install and keep using the All API Hub Safari extension on your Mac. Safari installs extensions through a companion macOS app. After setup, your accounts and settings are stored locally.

## Verified environment

This installation flow was verified on macOS 26.6.2 and Safari 26.6.2. This describes the environment actually tested; it is not a statement of minimum system requirements.

## Install

1. Open the [latest All API Hub release](https://github.com/qixing-jk/all-api-hub/releases/latest) and download `all-api-hub-<version>-safari-xcode-bundle.zip`. Do not download the attachment named only `-safari.zip`.
2. Extract the archive, find the Xcode project, and open it in Xcode.
3. Select the macOS app and your Mac as the run destination in Xcode, then choose `Product > Run`. If Xcode asks about signing, choose the option for running locally as prompted.
4. In Safari, open `Safari > Settings > Advanced` and enable “Show features for web developers,” then open `Safari > Settings > Developer` and enable “Allow Unsigned Extensions.” Safari may ask for your Mac login password.
5. Open `Safari > Settings > Extensions`, enable `All API Hub`, and allow access to websites as needed.
6. Click the extension icon in Safari’s toolbar to use it.

If the extension is missing from the list, run the companion macOS app from Xcode once more, then reopen Safari’s Extensions settings.

## When you reopen Safari

Safari resets “Allow Unsigned Extensions” when it quits. Each time you reopen Safari, enable this option again and launch the `All API Hub` macOS app installed through Xcode. Keeping the app somewhere easy to find, such as `~/Applications`, makes this easier. This only affects whether the extension can run; it does not erase extension data.

## Where your data is stored

Accounts, settings, and other extension data are stored in the current Safari extension’s local storage. Quitting or reopening Safari normally does not clear them. Safari, Chrome, Firefox, and other devices do not sync this data automatically. To move data to another browser or device, use [data import and export](./data-management.md) or configure WebDAV backup. Export a backup before uninstalling the extension or clearing Safari extension data.

## Safari feature differences

Safari does not provide some extension APIs available in other browsers:

- The side panel API is unavailable; use the toolbar popup or options page.
- Safari’s bookmarks API cannot import accounts. Add accounts manually or import a backup.
- The extension notifications API is unavailable; check task results in the extension.
- The extension `clipboardRead` permission is unavailable. Select text or paste it manually when you need to inspect content.
- Safari’s separate Cookie requests are provided by the companion macOS app. Allow the extension to access the target website and grant the required Cookie permission. These requests support HTTPS; HTTP is limited to local `127.0.0.1` testing. If permission is missing or the native app is unavailable, the request stops instead of using the website’s current login session. If refreshing an account in the popup does not update it, refresh from the options page.

Individual sites may have their own limitations; installing the extension does not mean every feature is available on every site.

## Update or uninstall

**Update:** Download the latest Safari Xcode project archive from Releases, open and run the new app in Xcode, then confirm that `All API Hub` is enabled in Safari’s Extensions settings. Updating the same extension installation keeps its local data; backing up important data first is still recommended.

**Uninstall:** Uncheck `All API Hub` in `Safari > Settings > Extensions`, then delete the installed `All API Hub` macOS app. To also remove locally stored data, remove the corresponding data in Safari’s website and extension data settings.

## FAQ

### Why do I need to open an Xcode project?

Safari installs the extension inside a companion macOS app. The downloaded archive includes the project and required files; run it once with Xcode, then enable the extension in Safari settings.

### The extension stopped working after Safari restarted. Was my data lost?

Usually not. Safari resets “Allow Unsigned Extensions” when it quits, so enable it again and launch the companion app. Accounts and settings are stored in Safari’s local extension storage and are not deleted when this switch resets.

### How do I restore accounts on a new device?

Export the data from the original device or configure WebDAV backup. Then install the extension on the new device and import the data or restore the backup. Browsers do not sync extension data automatically.

## References

- [Apple: Running your Safari web extension](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension)
- [Apple Safari Web Extensions documentation](https://developer.apple.com/documentation/safari-extensions/safari-web-extensions)
- [Report an issue on GitHub](https://github.com/qixing-jk/all-api-hub/issues)
