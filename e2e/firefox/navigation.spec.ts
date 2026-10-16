import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"

import { expect, test } from "./extensionTest"

test.beforeEach(async ({ firefoxExtension }) => {
  expect(await firefoxExtension.isNativeSidebarOpen()).toBe(false)
})

test("Firefox account handoff opens the native sidebar and survives popup closure", async ({
  firefoxExtension: popup,
}, testInfo) => {
  await popup.openPopup()
  await popup.click(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton)
  await popup.nativeClickSelector('button[aria-label="Open Sidebar"]')
  await expect.poll(() => popup.isPopupOpen()).toBe(false)
  const sidebar = popup.page("sidepanel.html")
  await expect.poll(() => sidebar.isNativeSidebarOpen()).toBe(true)
  await sidebar.click(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton)
  await expect
    .poll(() =>
      sidebar.evaluate<boolean>(
        `Boolean(document.querySelector('[data-testid="${ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog}"]'))`,
      ),
    )
    .toBe(true)
  await sidebar.fill(
    ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput,
    "https://firefox-navigation.example",
  )
  await popup.openPopup()
  await popup.closePopup()
  await expect
    .poll(() =>
      sidebar.evaluate<string>(
        `document.querySelector('[data-testid="${ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput}"]').value`,
      ),
    )
    .toBe("https://firefox-navigation.example")
  await sidebar.screenshot(
    testInfo.outputPath("sidebar-after-popup-closure.png"),
  )
})

for (const unavailable of ["missing", "rejected"] as const) {
  test(`Firefox continues account creation in Options when sidebar opening is ${unavailable}`, async ({
    firefoxExtension: popup,
  }, testInfo) => {
    await popup.openPopup()
    // Fault injection is limited to the browser API boundary in this document.
    await popup.evaluate(`(() => {
      browser.sidebarAction.open = ${unavailable === "missing" ? "undefined" : "() => Promise.reject(new Error('E2E sidebar unavailable'))"}
      return true
    })()`)
    await popup.click(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton)
    await popup.nativeClickSelector(
      `button[aria-label="${unavailable === "missing" ? "Continue in full page" : "Open Sidebar"}"]`,
    )
    await expect.poll(() => popup.isPopupOpen()).toBe(false)
    const options = popup.page("options.html")
    await expect
      .poll(() => options.evaluate<string>("location.hash"))
      .toBe(`#${MENU_ITEM_IDS.ACCOUNT}`)
    await expect
      .poll(() =>
        options.evaluate<boolean>(
          `Boolean(document.querySelector('[data-testid="${ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog}"]'))`,
        ),
      )
      .toBe(true)
    expect(await popup.isNativeSidebarOpen()).toBe(false)
    await options.fill(
      ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput,
      "https://firefox-fallback.example",
    )
    await expect
      .poll(() =>
        options.evaluate<string>(
          `document.querySelector('[data-testid="${ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput}"]').value`,
        ),
      )
      .toBe("https://firefox-fallback.example")
    await options.screenshot(
      testInfo.outputPath("options-account-continuation.png"),
    )
  })
}

test("Firefox keeps its handoff reminder retryable when sidebar and Options both fail", async ({
  firefoxExtension: popup,
}, testInfo) => {
  await popup.openPopup()
  await popup.evaluate(`(() => {
    browser.sidebarAction.open = () => Promise.reject(new Error('E2E sidebar unavailable'))
    const createTab = browser.tabs.create.bind(browser.tabs)
    browser.tabs.create = (...args) => {
      browser.tabs.create = createTab
      return Promise.reject(new Error('E2E tab creation unavailable'))
    }
    return true
  })()`)
  await popup.click(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton)
  await popup.nativeClickSelector('button[aria-label="Open Sidebar"]')
  await expect
    .poll(() =>
      popup.evaluate<boolean>(
        `[...document.querySelectorAll('[role="alert"]')].some(element => element.textContent.includes('Unable to open the side panel or full page'))`,
      ),
    )
    .toBe(true)
  expect(await popup.isPopupOpen()).toBe(true)
  expect(
    await popup.evaluate<boolean>(`(() => {
    const buttons = document.querySelectorAll('[role="dialog"] button')
    return [...buttons].every(button => {
      const bounds = button.getBoundingClientRect()
      return bounds.top >= 0 && bounds.bottom <= innerHeight
    })
  })()`),
  ).toBe(true)
  await popup.screenshot(testInfo.outputPath("handoff-retry.png"))
  await popup.nativeClickSelector('button[aria-label="Open Sidebar"]')
  const options = popup.page("options.html")
  await expect
    .poll(() =>
      options.evaluate<boolean>(
        `Boolean(document.querySelector('[data-testid="${ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog}"]'))`,
      ),
    )
    .toBe(true)
  await expect.poll(() => popup.isPopupOpen()).toBe(false)
})
