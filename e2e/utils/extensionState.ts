import type { BrowserContext, Page, Worker } from "@playwright/test"
import { expect } from "@playwright/test"

import { OPTIONS_OVERVIEW_TEST_IDS } from "~/features/OptionsOverview/testIds"

/**
 * Detect whether a page URL is an options page carrying the permissions
 * onboarding query flag.
 */
function isPermissionOnboardingPage(page: Page): boolean {
  try {
    const url = new URL(page.url())
    return url.searchParams.get("onboarding") === "permissions"
  } catch {
    return false
  }
}

/**
 * Resolve the MV3 service worker, waiting briefly if the extension just started.
 */
export async function getServiceWorker(
  context: BrowserContext,
): Promise<Worker> {
  return (
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 15_000 }))
  )
}

/**
 * Persist a Plasmo-backed local-storage value from inside the service worker.
 */
export async function setPlasmoStorageValue(
  serviceWorker: Worker,
  key: string,
  value: unknown,
) {
  const serialized = JSON.stringify(value)
  await serviceWorker.evaluate(
    async ({ storageKey, storageValue }) => {
      const chromeApi = (globalThis as any).chrome
      await new Promise<void>((resolve, reject) => {
        chromeApi.storage.local.set(
          {
            [storageKey]: storageValue,
          },
          () => {
            const error = chromeApi.runtime?.lastError
            if (error) {
              reject(new Error(error.message))
              return
            }
            resolve()
          },
        )
      })
    },
    { storageKey: key, storageValue: serialized },
  )
}

/**
 * Remove a raw key from chrome.storage.local inside the service worker context.
 */
export async function removePlasmoStorageKey(
  serviceWorker: Worker,
  key: string,
) {
  await serviceWorker.evaluate(async (storageKey) => {
    const chromeApi = (globalThis as any).chrome
    await new Promise<void>((resolve, reject) => {
      chromeApi.storage.local.remove(storageKey, () => {
        const error = chromeApi.runtime?.lastError
        if (error) {
          reject(new Error(error.message))
          return
        }
        resolve()
      })
    })
  }, key)
}

/**
 * Read a raw value from chrome.storage.local without local deserialization.
 */
export async function getPlasmoStorageRawValue<T>(
  serviceWorker: Worker,
  key: string,
): Promise<T> {
  return await serviceWorker.evaluate(async (storageKey) => {
    const chromeApi = (globalThis as any).chrome
    return await new Promise<T>((resolve, reject) => {
      chromeApi.storage.local.get(storageKey, (stored: Record<string, T>) => {
        const error = chromeApi.runtime?.lastError
        if (error) {
          reject(new Error(error.message))
          return
        }
        resolve(stored[storageKey])
      })
    })
  }, key)
}

async function getManifestPermissionsField(
  page: Page,
  field: "permissions" | "optional_permissions",
): Promise<string[]> {
  return await page.evaluate((field) => {
    const chromeApi = (
      globalThis as typeof globalThis & { chrome?: typeof chrome }
    ).chrome

    if (!chromeApi?.runtime?.getManifest) {
      throw new Error("chrome.runtime.getManifest is unavailable")
    }

    return [...(chromeApi.runtime.getManifest()[field] ?? [])]
  }, field)
}

/**
 * Read required permissions declared by the built extension manifest.
 */
export async function getManifestRequiredPermissions(
  page: Page,
): Promise<string[]> {
  return await getManifestPermissionsField(page, "permissions")
}

/**
 * Read optional permissions declared by the built extension manifest.
 */
export async function getManifestOptionalPermissions(
  page: Page,
): Promise<string[]> {
  return await getManifestPermissionsField(page, "optional_permissions")
}

/**
 * Check whether a specific extension optional permission is currently granted.
 */
export async function hasOptionalPermission(
  page: Page,
  permission: string,
): Promise<boolean> {
  return await page.evaluate(async (permission) => {
    const chromeApi = (
      globalThis as typeof globalThis & { chrome?: typeof chrome }
    ).chrome

    if (!chromeApi?.permissions) {
      throw new Error("chrome.permissions is unavailable in extension context")
    }

    return await chromeApi.permissions.contains({
      permissions: [permission],
    })
  }, permission)
}

/**
 * Request optional permissions from the extension page and verify the browser
 * actually grants each requested permission.
 */
export async function requestAndExpectOptionalPermissions(
  page: Page,
  permissions: string[],
) {
  if (permissions.length === 0) {
    return
  }

  const granted = await page.evaluate(async (permissions) => {
    const chromeApi = (
      globalThis as typeof globalThis & { chrome?: typeof chrome }
    ).chrome

    if (!chromeApi?.permissions) {
      throw new Error("chrome.permissions is unavailable in extension context")
    }

    return await chromeApi.permissions.request({ permissions })
  }, permissions)

  expect(granted).toBe(true)

  for (const permission of permissions) {
    await expect
      .poll(() => hasOptionalPermission(page, permission), {
        message: `${permission} permission should be granted`,
      })
      .toBe(true)
  }
}

/**
 * Close every page in the context except the one the test actively drives.
 */
export async function closeOtherPages(
  context: BrowserContext,
  keepPage?: Page,
): Promise<void> {
  await Promise.allSettled(
    context
      .pages()
      .filter((existingPage) => existingPage !== keepPage)
      .map((existingPage) => existingPage.close()),
  )
}

/**
 * Assert that the first-install permission onboarding dialog is not present.
 */
export async function expectPermissionOnboardingHidden(page: Page) {
  await expect
    .poll(() => isPermissionOnboardingPage(page), {
      message: "Permission onboarding query param should not be present",
    })
    .toBe(false)

  await expect(
    page.getByTestId(OPTIONS_OVERVIEW_TEST_IDS.permissionOnboardingDialog),
  ).toHaveCount(0)
}
