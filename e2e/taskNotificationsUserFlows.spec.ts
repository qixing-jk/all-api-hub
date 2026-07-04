import type { Page, Worker } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { BASIC_SETTINGS_TEST_IDS } from "~/features/BasicSettings/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getServiceWorker,
  hasOptionalPermission,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const NOTIFICATIONS_PERMISSION = "notifications"
const RECORDED_NOTIFICATIONS_KEY = "__aahE2eTaskNotifications"
const NOTIFICATIONS_PERMISSION_STATE_KEY =
  "__aahE2eNotificationsPermissionState"

type RecordedNotification = {
  id: string
  options: {
    type?: string
    title?: string
    message?: string
    isClickable?: boolean
  }
}

type NotificationsPermissionState = {
  granted: boolean
  grantOnRequest: boolean
}

type NotificationsApiStub = {
  __aahE2ePatched?: boolean
  create?: (
    id: string,
    options: browser.notifications.CreateNotificationOptions,
  ) => Promise<string>
  clear?: (notificationId?: string) => Promise<boolean>
  onClicked?: {
    addListener: (callback?: (notificationId: string) => void) => void
    removeListener: (callback?: (notificationId: string) => void) => void
  }
}

async function installNotificationRecorder(serviceWorker: Worker) {
  await serviceWorker.evaluate((storageKey) => {
    const host = globalThis as typeof globalThis & Record<string, unknown>
    const root = (host.browser ?? host.chrome) as
      | (Record<string, unknown> & {
          notifications?: NotificationsApiStub
        })
      | undefined

    host[storageKey] = []

    if (!root) {
      return
    }

    root.notifications ??= {}
    const api = root.notifications

    if (!api || (api as any).__aahE2ePatched) {
      return
    }

    const originalCreate = api.create?.bind(api)
    api.create = async (
      id: string,
      options: browser.notifications.CreateNotificationOptions,
    ) => {
      ;(host[storageKey] as RecordedNotification[] | undefined)?.push({
        id,
        options: {
          type: options.type,
          title: options.title,
          message: options.message,
          isClickable: options.isClickable,
        },
      })

      if (!originalCreate) {
        return id
      }

      try {
        const createdId = await originalCreate(id, options)
        return createdId || id
      } catch {
        return id
      }
    }
    api.clear ??= async () => true
    api.onClicked ??= {
      addListener: () => undefined,
      removeListener: () => undefined,
    }
    ;(api as any).__aahE2ePatched = true
  }, RECORDED_NOTIFICATIONS_KEY)
}

async function readRecordedNotifications(
  serviceWorker: Worker,
): Promise<RecordedNotification[]> {
  return await serviceWorker.evaluate((storageKey) => {
    const host = globalThis as typeof globalThis & Record<string, unknown>
    return (host[storageKey] as RecordedNotification[] | undefined) ?? []
  }, RECORDED_NOTIFICATIONS_KEY)
}

async function installNotificationsPermissionStub(
  page: Page,
  options: { grantOnRequest?: boolean } = {},
) {
  await page.addInitScript(
    ({ grantOnRequest, permission, stateKey }) => {
      const host = globalThis as typeof globalThis & {
        browser?: typeof browser
        chrome?: typeof chrome
      } & Record<string, unknown>
      const permissionState = {
        granted: false,
        grantOnRequest,
      }
      host[stateKey] = permissionState

      const patchPermissions = (api?: typeof chrome.permissions) => {
        if (!api || (api as any).__aahE2eNotificationsPermissionPatched) {
          return
        }

        const originalContains = api.contains.bind(api)
        const originalRequest = api.request.bind(api)
        const getPermissionState = () =>
          (host[stateKey] as NotificationsPermissionState | undefined) ??
          permissionState

        api.contains = ((permissions: chrome.permissions.Permissions) => {
          if (permissions.permissions?.includes(permission)) {
            return Promise.resolve(getPermissionState().granted)
          }
          return originalContains(permissions)
        }) as typeof api.contains

        api.request = ((permissions: chrome.permissions.Permissions) => {
          if (permissions.permissions?.includes(permission)) {
            const state = getPermissionState()
            state.granted = state.grantOnRequest
            return Promise.resolve(state.grantOnRequest)
          }
          return originalRequest(permissions)
        }) as typeof api.request
        ;(api as any).__aahE2eNotificationsPermissionPatched = true
      }

      patchPermissions(host.chrome?.permissions)
      patchPermissions(host.browser?.permissions as typeof chrome.permissions)
    },
    {
      grantOnRequest: options.grantOnRequest ?? true,
      permission: NOTIFICATIONS_PERMISSION,
      stateKey: NOTIFICATIONS_PERMISSION_STATE_KEY,
    },
  )
}

async function grantNotificationsPermissionInServiceWorker(
  serviceWorker: Worker,
) {
  await serviceWorker.evaluate((permission) => {
    const host = globalThis as typeof globalThis & {
      browser?: typeof browser
      chrome?: typeof chrome
    }

    const patchPermissions = (api?: typeof chrome.permissions) => {
      if (!api || (api as any).__aahE2eNotificationsPermissionPatched) {
        return
      }

      const originalContains = api.contains.bind(api)

      api.contains = ((permissions: chrome.permissions.Permissions) => {
        if (permissions.permissions?.includes(permission)) {
          return Promise.resolve(true)
        }
        return originalContains(permissions)
      }) as typeof api.contains
      ;(api as any).__aahE2eNotificationsPermissionPatched = true
    }

    patchPermissions(host.chrome?.permissions)
    patchPermissions(host.browser?.permissions as typeof chrome.permissions)
  }, NOTIFICATIONS_PERMISSION)
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await installNotificationsPermissionStub(page)
  await stubLlmMetadataIndex(context)
})

test("sends a browser task notification from notification settings", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await grantNotificationsPermissionInServiceWorker(serviceWorker)
  await installNotificationRecorder(serviceWorker)

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?tab=notifications&anchor=${SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_BROWSER}#${MENU_ITEM_IDS.BASIC}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)
  await expect(page.getByTestId(BASIC_SETTINGS_TEST_IDS.page)).toBeVisible()

  const browserChannel = page.locator(
    `#${SETTINGS_ANCHORS.TASK_NOTIFICATIONS_CHANNEL_BROWSER}`,
  )
  await expect(browserChannel).toBeVisible()

  if (!(await hasOptionalPermission(page, NOTIFICATIONS_PERMISSION))) {
    await page
      .getByTestId(
        BASIC_SETTINGS_TEST_IDS.taskNotificationsPermissionGrantButton,
      )
      .click()
  }

  await expect
    .poll(() => hasOptionalPermission(page, NOTIFICATIONS_PERMISSION), {
      message: "Notifications permission should be granted before testing",
    })
    .toBe(true)

  await expect(
    page
      .locator(`#${SETTINGS_ANCHORS.TASK_NOTIFICATIONS_PERMISSION}`)
      .getByText("Granted"),
  ).toBeVisible()

  const testButton = page.getByTestId(
    BASIC_SETTINGS_TEST_IDS.taskNotificationsBrowserTestButton,
  )
  await expect(testButton).toBeEnabled()
  await testButton.click()

  await expect
    .poll(() => readRecordedNotifications(serviceWorker), {
      message: "Browser task notification should be created",
    })
    .toContainEqual({
      id: "all-api-hub:task:autoCheckin",
      options: {
        type: "basic",
        title: "All API Hub test notification",
        message: "This is an All API Hub task notification test.",
        isClickable: true,
      },
    })
  await expect(page.getByText("Test notification sent")).toBeVisible()
})

test("keeps browser task notification disabled when notification permission is denied", async ({
  extensionId,
  page,
}) => {
  await installNotificationsPermissionStub(page, { grantOnRequest: false })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?tab=notifications&anchor=${SETTINGS_ANCHORS.TASK_NOTIFICATIONS_PERMISSION}#${MENU_ITEM_IDS.BASIC}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)
  await expect(page.getByTestId(BASIC_SETTINGS_TEST_IDS.page)).toBeVisible()

  const permissionSection = page.locator(
    `#${SETTINGS_ANCHORS.TASK_NOTIFICATIONS_PERMISSION}`,
  )
  await expect(permissionSection).toBeVisible()
  await expect(permissionSection.getByText("Not granted")).toBeVisible()

  const browserTestButton = page.getByTestId(
    BASIC_SETTINGS_TEST_IDS.taskNotificationsBrowserTestButton,
  )
  await expect(browserTestButton).toBeDisabled()

  await page
    .getByTestId(BASIC_SETTINGS_TEST_IDS.taskNotificationsPermissionGrantButton)
    .click()

  await expect(
    page.getByText("Notification permission was not granted"),
  ).toBeVisible()
  await expect(permissionSection.getByText("Not granted")).toBeVisible()
  await expect(browserTestButton).toBeDisabled()
  await expect
    .poll(() => hasOptionalPermission(page, NOTIFICATIONS_PERMISSION), {
      message: "Notifications permission should remain denied",
    })
    .toBe(false)
})
