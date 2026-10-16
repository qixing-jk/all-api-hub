import { POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import { createDefaultAccountStorageConfig } from "~/services/accounts/editing/accountDefaults"
import { createStoredBookmark } from "~~/e2e/utils/commonUserFlows"

import { expect, test } from "./extensionTest"

test("real Firefox action popup fills its viewport and keeps tabs reachable", async ({
  firefoxExtension: popup,
}, testInfo) => {
  await popup.openPopup()
  await expect
    .poll(() =>
      popup.evaluate(`(() => {
    const bounds = document.querySelector('[data-testid="${POPUP_TEST_IDS.scrollContainer}"]').getBoundingClientRect()
    return {width: Math.round(bounds.width), height: Math.round(bounds.height), viewportWidth: innerWidth, viewportHeight: innerHeight}
  })()`),
    )
    .toEqual({
      width: 410,
      height: 600,
      viewportWidth: 410,
      viewportHeight: 600,
    })
  await popup.screenshot(testInfo.outputPath("accounts.png"))
  await popup.click(POPUP_TEST_IDS.bookmarksTab)
  await expect
    .poll(() =>
      popup.evaluate<boolean>(
        `document.body.innerText.includes('No bookmarks yet')`,
      ),
    )
    .toBe(true)
  await popup.screenshot(testInfo.outputPath("bookmarks.png"))
  await popup.click(POPUP_TEST_IDS.apiCredentialProfilesTab)
  await expect
    .poll(() =>
      popup.evaluate<boolean>(
        `document.body.innerText.includes('No API credentials saved yet')`,
      ),
    )
    .toBe(true)
  await popup.screenshot(testInfo.outputPath("credentials.png"))
  await popup.click(POPUP_TEST_IDS.accountsTab)
  await expect
    .poll(() =>
      popup.evaluate<boolean>(
        `document.body.innerText.includes('No accounts yet')`,
      ),
    )
    .toBe(true)
  expect(
    await popup.evaluate(`(() => {
    const element = document.querySelector('[data-testid="${POPUP_TEST_IDS.scrollContainer}"]')
    return {documentOverflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
      horizontalOverflow: element.scrollWidth > element.clientWidth}
  })()`),
  ).toEqual({ documentOverflow: false, horizontalOverflow: false })
})

test("real Firefox popup shows a bounded account handoff reminder", async ({
  firefoxExtension: popup,
}, testInfo) => {
  await popup.openPopup()
  await popup.click(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton)
  await expect
    .poll(() =>
      popup.evaluate<boolean>(
        `document.body.innerText.includes('Firefox Browser Feature Limitation')`,
      ),
    )
    .toBe(true)
  expect(
    await popup.evaluate<boolean>(
      `Boolean(document.querySelector('button[aria-label="Open Sidebar"]'))`,
    ),
  ).toBe(true)
  expect(
    await popup.evaluate(`(() => {
    const bounds = document.querySelector('[role="dialog"]').getBoundingClientRect()
    return bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight
  })()`),
  ).toBe(true)
  await popup.screenshot(testInfo.outputPath("account-reminder.png"))
  await popup.clickSelector('button[aria-label="Confirm"]')
  await expect
    .poll(() =>
      popup.evaluate<boolean>(`!document.querySelector('[role="dialog"]')`),
    )
    .toBe(true)
  await popup.click(POPUP_TEST_IDS.bookmarksTab)
  await expect
    .poll(() =>
      popup.evaluate<boolean>(
        `document.body.innerText.includes('No bookmarks yet')`,
      ),
    )
    .toBe(true)
})

test("real Firefox popup keeps credential dialog and protocol selector inside its bounds", async ({
  firefoxExtension: popup,
}, testInfo) => {
  await popup.openPopup()
  await popup.click(POPUP_TEST_IDS.apiCredentialProfilesTab)
  await popup.clickButton("Add API credential")
  await expect
    .poll(() =>
      popup.evaluate<boolean>(
        `Boolean(document.querySelector('[data-testid="${API_CREDENTIAL_PROFILES_TEST_IDS.dialog}"]'))`,
      ),
    )
    .toBe(true)
  await popup.clickSelector('[role="dialog"] [role="combobox"]')
  await expect
    .poll(() =>
      popup.evaluate<boolean>(
        `Boolean(document.querySelector('[role="listbox"]'))`,
      ),
    )
    .toBe(true)
  await expect
    .poll(() =>
      popup.evaluate(`(() => {
    const listbox = document.querySelector('[role="listbox"]')
    const bounds = listbox.getBoundingClientRect()
    const dialog = document.querySelector('[role="dialog"]').getBoundingClientRect()
    return {width: innerWidth, height: innerHeight,
      listboxVisible: bounds.width > 0 && bounds.height > 0,
      listboxClipped: bounds.left < -1 || bounds.top < -1 || bounds.right > innerWidth + 1 || bounds.bottom > innerHeight + 1,
      dialogClipped: dialog.left < -1 || dialog.top < -1 || dialog.right > innerWidth + 1 || dialog.bottom > innerHeight + 1,
      documentOverflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight}
  })()`),
    )
    .toEqual({
      width: 410,
      height: 600,
      listboxVisible: true,
      listboxClipped: false,
      dialogClipped: false,
      documentOverflow: false,
    })
  await popup.screenshot(testInfo.outputPath("protocol-selector.png"))
  await popup.clickSelector('[role="option"][data-value="anthropic"]')
  await expect
    .poll(() =>
      popup.evaluate<boolean>(
        `document.querySelector('[role="dialog"] [role="combobox"]').innerText.includes('Anthropic')`,
      ),
    )
    .toBe(true)
  await expect
    .poll(() =>
      popup.evaluate<boolean>(`!document.querySelector('[role="listbox"]')`),
    )
    .toBe(true)
})

test.describe("saved bookmarks", () => {
  test.use({
    accountStorage: {
      ...createDefaultAccountStorageConfig(),
      bookmarks: Array.from({ length: 20 }, (_, index) =>
        createStoredBookmark({
          id: `firefox-bookmark-${index}`,
          name: `Firefox bookmark ${String(index).padStart(2, "0")}`,
        }),
      ),
    },
  })
  test("real Firefox popup scrolls saved bookmarks without scrolling the document", async ({
    firefoxExtension: popup,
  }, testInfo) => {
    await popup.openPopup()
    await popup.click(POPUP_TEST_IDS.bookmarksTab)
    await expect
      .poll(() =>
        popup.evaluate<boolean>(
          `document.body.innerText.includes('Firefox bookmark 19')`,
        ),
      )
      .toBe(true)
    await expect
      .poll(() =>
        popup.evaluate<boolean>(`(() => {
    const element = document.querySelector('[data-testid="${POPUP_TEST_IDS.scrollContainer}"]')
    return element.scrollHeight > element.clientHeight
  })()`),
      )
      .toBe(true)
    await popup.evaluate(`(() => {
    const element = document.querySelector('[data-testid="${POPUP_TEST_IDS.scrollContainer}"]')
    element.scrollTop = element.scrollHeight
    return true
  })()`)
    await expect
      .poll(() =>
        popup.evaluate(`(() => {
    const element = document.querySelector('[data-testid="${POPUP_TEST_IDS.scrollContainer}"]')
    return {scrolled: element.scrollTop > 0, documentScroll: document.scrollingElement.scrollTop,
      horizontalOverflow: element.scrollWidth > element.clientWidth,
      width: innerWidth, height: innerHeight}
  })()`),
      )
      .toEqual({
        scrolled: true,
        documentScroll: 0,
        horizontalOverflow: false,
        width: 410,
        height: 600,
      })
    await popup.screenshot(testInfo.outputPath("bookmarks-scrolled.png"))
  })
})
