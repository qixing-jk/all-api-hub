import { POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import { OPTIONS_OVERVIEW_TEST_IDS } from "~/features/OptionsOverview/testIds"
import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { API_CREDENTIAL_PROFILES_CONFIG_VERSION } from "~/types/apiCredentialProfiles"
import { createStoredApiCredentialProfile } from "~~/e2e/utils/commonUserFlows"

import { expect, test } from "./extensionTest"

test("Firefox grants all onboarding permissions after denial and retry", async ({
  firefoxExtension,
}) => {
  const options = firefoxExtension.page("options.html")
  await options.openInTab("?onboarding=permissions#overview")
  const grantAll = `button:has(+ [data-testid="${OPTIONS_OVERVIEW_TEST_IDS.permissionOnboardingDeferButton}"])`
  const granted = () =>
    options.evaluateAsync<boolean>(
      "browser.permissions.contains({permissions: browser.runtime.getManifest().optional_permissions})",
    )

  expect(await granted()).toBe(false)
  await options.nativeClickSelector(grantAll)
  await options.respondToPermissionPrompt(false)
  expect(await granted()).toBe(false)
  await options.nativeClickSelector(`${grantAll}:not(:disabled)`)
  await options.respondToPermissionPrompt(true)
  await expect.poll(granted).toBe(true)
  await expect
    .poll(() =>
      options.evaluate<boolean>(
        "document.body.innerText.includes('All recommended permissions granted')",
      ),
    )
    .toBe(true)
})

test("Firefox clipboard permission can be denied, granted on retry, and revoked", async ({
  firefoxExtension,
}, testInfo) => {
  const options = firefoxExtension.page("options.html")
  await options.openInTab("?tab=permissions#basic")
  const granted = () =>
    options.evaluateAsync<boolean>(
      "browser.permissions.contains({permissions: ['clipboardRead']})",
    )
  const action = () =>
    options.evaluate<string>(
      "document.querySelector('#clipboardRead button')?.textContent.trim() ?? ''",
    )
  expect(await granted()).toBe(false)
  await expect.poll(action).toBe("Allow (recommended)")
  await options.nativeClickSelector("#clipboardRead button")
  await options.respondToPermissionPrompt(false)
  await expect.poll(action).toBe("Allow (recommended)")
  expect(await granted()).toBe(false)
  await options.nativeClickSelector("#clipboardRead button")
  await options.respondToPermissionPrompt(true)
  await expect.poll(granted).toBe(true)
  await expect.poll(action).toBe("Revoke")
  await options.screenshot(
    testInfo.outputPath("clipboard-permission-granted.png"),
  )
  await options.nativeClickSelector("#clipboardRead button")
  await expect.poll(granted).toBe(false)
  await expect.poll(action).toBe("Allow (recommended)")
})

test("Firefox copies a credential with native activation and recovers from clipboard rejection", async ({
  firefoxExtension: popup,
}, testInfo) => {
  const options = popup.page("options.html")
  await options.openInTab("?tab=permissions#basic")
  await options.nativeClickSelector("#clipboardRead button:not(:disabled)")
  await options.respondToPermissionPrompt(true)
  await expect
    .poll(() =>
      options.evaluateAsync<boolean>(
        "browser.permissions.contains({permissions: ['clipboardRead']})",
      ),
    )
    .toBe(true)
  const config = {
    version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
    profiles: [
      createStoredApiCredentialProfile({ apiKey: "sk-firefox-synthetic-copy" }),
    ],
    lastUpdated: Date.now(),
  }
  await options.evaluateAsync(`navigator.locks.request(${JSON.stringify(STORAGE_LOCKS.API_CREDENTIAL_PROFILES)}, () => browser.storage.local.set({
    [${JSON.stringify(STORAGE_KEYS.API_CREDENTIAL_PROFILES)}]: ${JSON.stringify(JSON.stringify(config))}
  }))`)
  await popup.openPopup()
  await popup.click(POPUP_TEST_IDS.apiCredentialProfilesTab)
  const copyButton = `[data-testid="${API_CREDENTIAL_PROFILES_TEST_IDS.copyApiKeyButton}"]`
  await popup.nativeClickSelector(copyButton)
  await expect
    .poll(() => popup.evaluateAsync<string>("navigator.clipboard.readText()"))
    .toBe("sk-firefox-synthetic-copy")
  await expect
    .poll(() =>
      popup.evaluate<boolean>(
        "document.body.innerText.includes('API key copied')",
      ),
    )
    .toBe(true)
  // Toasts can overlap the copy button near the bottom of the native popup.
  // Wait for dismissal before issuing the next pointer click.
  await expect
    .poll(() =>
      popup.evaluate<boolean>(
        "document.body.innerText.includes('API key copied')",
      ),
    )
    .toBe(false)
  // A rejected platform write must show failure and leave the existing value intact.
  await popup.evaluate(`(() => {
    const write = navigator.clipboard.writeText.bind(navigator.clipboard)
    navigator.clipboard.writeText = () => {
      navigator.clipboard.writeText = write
      return Promise.reject(new DOMException('E2E clipboard denied', 'NotAllowedError'))
    }
    return true
  })()`)
  await popup.nativeClickSelector(copyButton)
  await expect
    .poll(() =>
      popup.evaluate<boolean>(
        "document.body.innerText.includes('Copy failed')",
      ),
    )
    .toBe(true)
  await expect
    .poll(() => popup.evaluateAsync<string>("navigator.clipboard.readText()"))
    .toBe("sk-firefox-synthetic-copy")
  await popup.screenshot(testInfo.outputPath("clipboard-rejection.png"))
  await expect
    .poll(() =>
      popup.evaluate<boolean>(
        "document.body.innerText.includes('Copy failed')",
      ),
    )
    .toBe(false)
  // Firefox headless keeps its clipboard in memory. Replace the value so a
  // successful retry cannot pass by reading the earlier successful copy.
  // Read both the browser-owned sentinel and the retry from the privileged
  // context. A popup read after the sentinel can require a new activation on
  // Linux, independently of whether the real native copy succeeded.
  const readClipboard = () =>
    popup.driver.executeScript<string>(`
      const transferable = Cc['@mozilla.org/widget/transferable;1'].createInstance(Ci.nsITransferable)
      transferable.init(null)
      transferable.addDataFlavor('text/plain')
      Services.clipboard.getData(transferable, Ci.nsIClipboard.kGlobalClipboard)
      const data = {}
      transferable.getTransferData('text/plain', data)
      return data.value.QueryInterface(Ci.nsISupportsString).data
    `)
  await popup.driver.executeScript(`
    Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper)
      .copyString('Firefox clipboard retry sentinel')
  `)
  expect(await readClipboard()).toBe("Firefox clipboard retry sentinel")
  await popup.nativeClickSelector(copyButton)
  await expect.poll(readClipboard).toBe("sk-firefox-synthetic-copy")
})
