import type { Page } from "@playwright/test"

import { CC_SWITCH_EXPORT_TEST_IDS } from "~/components/CCSwitchExportDialog.testIds"
import { expect } from "~~/e2e/fixtures/extensionTest"

const OPENED_CC_SWITCH_URLS_KEY = "__aah_e2e_opened_cc_switch_urls__"

export type CcSwitchDeepLinkExpectation = {
  app?: string
  name?: string
  homepage?: string
  endpoint?: string
  apiKey?: string
  model?: string
}

async function installCcSwitchWindowOpenRecorder(page: Page) {
  await page.evaluate((storageKey) => {
    window.sessionStorage.setItem(storageKey, JSON.stringify([]))

    const readUrls = () => {
      try {
        const raw = window.sessionStorage.getItem(storageKey)
        return raw ? (JSON.parse(raw) as string[]) : []
      } catch {
        return []
      }
    }

    window.open = ((url?: string | URL) => {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify([...readUrls(), url?.toString() ?? ""]),
      )
      return null
    }) as typeof window.open
  }, OPENED_CC_SWITCH_URLS_KEY)
}

async function readOpenedCcSwitchUrls(page: Page) {
  return await page.evaluate((storageKey) => {
    try {
      const raw = window.sessionStorage.getItem(storageKey)
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
      return []
    }
  }, OPENED_CC_SWITCH_URLS_KEY)
}

function expectCcSwitchDeepLink(
  url: string,
  expected: CcSwitchDeepLinkExpectation,
) {
  const parsed = new URL(url)
  expect(parsed.protocol).toBe("ccswitch:")
  expect(parsed.host).toBe("v1")
  expect(parsed.pathname).toBe("/import")
  expect(parsed.searchParams.get("resource")).toBe("provider")

  for (const [key, value] of Object.entries(expected)) {
    if (value !== undefined) {
      expect(parsed.searchParams.get(key)).toBe(value)
    }
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
}

async function selectCcSwitchModel(params: {
  page: Page
  modelPicker: ReturnType<Page["getByTestId"]>
  modelName: string
}) {
  await params.modelPicker.click()

  const searchInput = params.page.getByTestId(
    CC_SWITCH_EXPORT_TEST_IDS.modelSearchInput,
  )
  await expect(searchInput).toBeVisible({ timeout: 10_000 })
  await searchInput.fill(params.modelName)
  await expect(
    params.page
      .getByRole("option", {
        name: new RegExp(escapeRegExp(params.modelName), "u"),
      })
      .first(),
  ).toBeVisible({ timeout: 10_000 })
  await searchInput.press("Enter")

  const selected = await expect(params.modelPicker)
    .toContainText(params.modelName, { timeout: 3_000 })
    .then(() => true)
    .catch(() => false)

  if (selected) {
    return
  }

  await params.modelPicker.click()
  await searchInput.fill(params.modelName)
  await params.page
    .getByRole("option", {
      name: new RegExp(escapeRegExp(params.modelName), "u"),
    })
    .first()
    .click()
}

export async function verifyCcSwitchModelPickerCancelable(params: {
  page: Page
}) {
  const dialog = params.page.getByTestId(CC_SWITCH_EXPORT_TEST_IDS.dialog)
  await expect(dialog).toBeVisible({ timeout: 30_000 })

  const modelPicker = dialog.getByTestId(CC_SWITCH_EXPORT_TEST_IDS.modelPicker)
  await expect(modelPicker).toBeVisible({ timeout: 30_000 })
  await expect(modelPicker).toBeEnabled({ timeout: 30_000 })

  await dialog.getByTestId(CC_SWITCH_EXPORT_TEST_IDS.cancelButton).click()
  await expect(dialog).toHaveCount(0, { timeout: 30_000 })
}

export async function verifyCcSwitchModelExportDeepLink(params: {
  page: Page
  modelName: string
  expected: CcSwitchDeepLinkExpectation
}) {
  await installCcSwitchWindowOpenRecorder(params.page)

  const dialog = params.page.getByTestId(CC_SWITCH_EXPORT_TEST_IDS.dialog)
  await expect(dialog).toBeVisible({ timeout: 30_000 })

  const modelPicker = dialog.getByTestId(CC_SWITCH_EXPORT_TEST_IDS.modelPicker)
  await expect(modelPicker).toBeVisible({ timeout: 30_000 })
  await expect(modelPicker).toBeEnabled({ timeout: 30_000 })
  await selectCcSwitchModel({
    page: params.page,
    modelPicker,
    modelName: params.modelName,
  })
  await expect(modelPicker).toContainText(params.modelName)

  await dialog.getByTestId(CC_SWITCH_EXPORT_TEST_IDS.exportButton).click()
  await expect(dialog).toHaveCount(0, { timeout: 30_000 })

  await expect
    .poll(async () => await readOpenedCcSwitchUrls(params.page), {
      timeout: 30_000,
    })
    .toHaveLength(1)

  const [url] = await readOpenedCcSwitchUrls(params.page)
  expectCcSwitchDeepLink(url, {
    model: params.modelName,
    ...params.expected,
  })
}
