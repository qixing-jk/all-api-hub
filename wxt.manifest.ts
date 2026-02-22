/**
 * Create a manifest for the extension based on the target browser.
 */
export function createExtensionManifest(targetBrowser: string) {
  const isFirefoxOrSafari =
    targetBrowser === "firefox" || targetBrowser === "safari"

  return {
    name: "__MSG_manifest_name__",
    description: "__MSG_manifest_description__",
    default_locale: "zh_CN",
    permissions: [
      "tabs",
      "storage",
      "alarms",
      "contextMenus",
      ...(isFirefoxOrSafari ? [] : ["sidePanel"]),
    ],
    ...(isFirefoxOrSafari
      ? {
          optional_permissions: [
            "cookies",
            "webRequest",
            "webRequestBlocking",
            "clipboardRead",
          ],
        }
      : {
          optional_permissions: [
            "cookies",
            "declarativeNetRequestWithHostAccess",
            "clipboardRead",
          ],
        }),
    // ensure can get site cookies, please refer to https://stackoverflow.com/a/70070106/22460724
    host_permissions: ["<all_urls>"],
    browser_specific_settings: {
      gecko: {
        id: "{bc73541a-133d-4b50-b261-36ea20df0d24}",
        strict_min_version: "58.0",
      },
      gecko_android: {
        strict_min_version: "120.0",
      },
    },
    commands: {
      _execute_sidebar_action: {
        description: "__MSG_manifest_commands_sidebar_action__",
      },
      _execute_browser_action: {
        description: "__MSG_manifest_commands_browser_action__",
      },
    },
  }
}
