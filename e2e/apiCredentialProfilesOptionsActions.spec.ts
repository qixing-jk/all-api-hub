import fs from "node:fs/promises"
import type { BrowserContext, Page } from "@playwright/test"

import { KILO_CODE_EXPORT_TEST_IDS } from "~/components/kiloCodeExportTestIds"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { verifyApiCredentialProfileCcSwitchModelPickerScenario } from "~~/e2e/scenarios/apiCredentialProfileVerification"
import {
  createStoredApiCredentialProfile,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedApiCredentialProfiles,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const CLIPBOARD_WRITES_KEY = "__aah_e2e_profile_clipboard_writes__"

async function installClipboardRecorder(page: Page) {
  await page.addInitScript((storageKey) => {
    window.sessionStorage.setItem(storageKey, JSON.stringify([]))

    const readWrites = (): string[] => {
      try {
        const raw = window.sessionStorage.getItem(storageKey)
        return raw ? (JSON.parse(raw) as string[]) : []
      } catch {
        return []
      }
    }

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          window.sessionStorage.setItem(
            storageKey,
            JSON.stringify([...readWrites(), text]),
          )
        },
      },
    })
  }, CLIPBOARD_WRITES_KEY)
}

async function readClipboardWrites(page: Page): Promise<string[]> {
  return await page.evaluate((storageKey) => {
    try {
      const raw = window.sessionStorage.getItem(storageKey)
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
      return []
    }
  }, CLIPBOARD_WRITES_KEY)
}

async function openProfilesPage(page: Page, extensionId: string) {
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)
}

async function installOpenAiCompatibleModelsRoute(
  context: BrowserContext,
  params: {
    baseUrl: string
    modelId: string
    onRequest?: () => void
  },
) {
  const normalizedBaseUrl = params.baseUrl.replace(/\/+$/, "")
  await context.route(`${normalizedBaseUrl}/v1/models`, async (route) => {
    params.onRequest?.()
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [{ id: params.modelId }],
      }),
    })
  })
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await installClipboardRecorder(page)
  await stubLlmMetadataIndex(context)
})

test("creates an API credential profile from the options page and persists it", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)

  await openProfilesPage(page, extensionId)

  await page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.addButton).click()
  const profileDialog = page.getByTestId(
    API_CREDENTIAL_PROFILES_TEST_IDS.dialog,
  )
  await expect(profileDialog).toBeVisible()
  await expect(
    profileDialog.getByRole("heading", { name: "Save API key" }),
  ).toBeVisible()

  await page.locator("#api-credential-profile-name").fill("Options Profile")
  await page
    .locator("#api-credential-profile-baseUrl")
    .fill("https://options-api.example.com/v1")
  await page.locator("#api-credential-profile-apiKey").fill("sk-options-page")
  await page
    .locator("#api-credential-profile-notes")
    .fill("Created from options E2E")
  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.dialogSaveButton)
    .click()

  await expect(
    page.getByRole("heading", { name: "Options Profile" }),
  ).toBeVisible()

  await expect
    .poll(async () => {
      const raw = await getPlasmoStorageRawValue<unknown>(
        serviceWorker,
        STORAGE_KEYS.API_CREDENTIAL_PROFILES,
      )

      if (typeof raw !== "string") return null

      try {
        const parsed = JSON.parse(raw) as {
          profiles?: Array<{
            name?: string
            baseUrl?: string
            apiKey?: string
            notes?: string
          }>
        }
        return (
          parsed.profiles?.find(
            (profile) => profile.name === "Options Profile",
          ) ?? null
        )
      } catch {
        return null
      }
    })
    .toMatchObject({
      name: "Options Profile",
      baseUrl: "https://options-api.example.com",
      apiKey: "sk-options-page",
      notes: "Created from options E2E",
    })
})

test("filters options-page profiles and copies reusable credentials", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedApiCredentialProfiles(serviceWorker, [
    createStoredApiCredentialProfile({
      id: "profile-primary",
      name: "Reusable Profile",
      baseUrl: "https://reusable.example.com",
      apiKey: "sk-reusable-profile",
      notes: "daily driver",
    }),
    createStoredApiCredentialProfile({
      id: "profile-secondary",
      name: "Archive Profile",
      baseUrl: "https://archive.example.com",
      apiKey: "sk-archive-profile",
      notes: "rarely used",
    }),
  ])

  await openProfilesPage(page, extensionId)

  const searchInput = page.getByPlaceholder(
    "Search by name, base URL, tag, or notes",
  )
  await searchInput.fill("daily driver")

  await expect(
    page.getByRole("heading", { name: "Reusable Profile" }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Archive Profile" }),
  ).toHaveCount(0)

  await page.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.showKeyButton).click()
  await expect(page.getByText("sk-reusable-profile")).toBeVisible()

  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.copyBaseUrlButton)
    .click()
  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.copyApiKeyButton)
    .click()
  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.copyBundleButton)
    .click()

  await expect
    .poll(() => readClipboardWrites(page))
    .toEqual([
      "https://reusable.example.com",
      "sk-reusable-profile",
      "BASE_URL=https://reusable.example.com\nAPI_KEY=sk-reusable-profile",
    ])
})

test("opens model management for an options-page API credential profile", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedApiCredentialProfiles(serviceWorker, [
    createStoredApiCredentialProfile({
      id: "profile-models",
      name: "Model Source Profile",
      baseUrl: "https://api.example.com",
      apiKey: "sk-model-source",
    }),
  ])

  await context.route("https://api.example.com/v1/models", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "ok",
        data: [{ id: "gpt-options-model" }],
      }),
    }),
  )

  await openProfilesPage(page, extensionId)

  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.openModelManagementButton)
    .click()

  await expect(page).toHaveURL((url) => {
    return (
      url.hash === `#${MENU_ITEM_IDS.MODELS}` &&
      url.searchParams.get("profileId") === "profile-models"
    )
  })
  await waitForExtensionRoot(page)

  await expect(page.getByText("gpt-options-model")).toBeVisible()
})

test("opens the CC Switch model picker for an API credential profile", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedApiCredentialProfiles(serviceWorker, [
    createStoredApiCredentialProfile({
      id: "profile-cc-switch",
      name: "CC Switch Profile",
      baseUrl: "https://cc-switch-profile.example.com",
      apiKey: "sk-cc-switch-profile",
    }),
  ])

  await context.route(
    "https://cc-switch-profile.example.com/v1/models",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [{ id: "gpt-cc-switch-profile" }],
        }),
      }),
  )

  await openProfilesPage(page, extensionId)

  await verifyApiCredentialProfileCcSwitchModelPickerScenario({
    page,
    profileName: "CC Switch Profile",
    modelName: "gpt-cc-switch-profile",
    expectedBaseUrl: "https://cc-switch-profile.example.com",
    expectedApiKey: "sk-cc-switch-profile",
  })
})

test("downloads Kilo Code settings for an API credential profile", async ({
  context,
  extensionId,
  page,
}) => {
  const profileName = "Example Profile"
  const profileBaseUrl = "https://kilo-export.example.invalid"
  const modelIds = [
    "example-model-a",
    "example-model-b",
    "vendor/example-model-c",
  ] as const
  const serviceWorker = await getServiceWorker(context)
  await seedApiCredentialProfiles(serviceWorker, [
    createStoredApiCredentialProfile({
      id: "profile-kilo-export",
      name: profileName,
      baseUrl: profileBaseUrl,
      apiKey: "sk-kilo-export-profile",
    }),
  ])

  await context.route(`${profileBaseUrl}/v1/models`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: modelIds.map((id) => ({ id })),
      }),
    })
  })

  await openProfilesPage(page, extensionId)

  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.exportMenuButton)
    .click()
  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.exportToKiloCodeMenuItem)
    .click()

  await expect(page.getByText("Export Kilo Code JSON")).toBeVisible()
  const slashBearingModel = modelIds[2]
  const defaultModel = page.getByTestId(KILO_CODE_EXPORT_TEST_IDS.defaultModel)
  await expect(defaultModel).toBeEnabled()
  await defaultModel.click()
  const defaultModelSearch = page.getByTestId(
    KILO_CODE_EXPORT_TEST_IDS.defaultModelSearch,
  )
  await defaultModelSearch.fill(slashBearingModel)
  const slashBearingModelOption = page.getByRole("option", {
    name: slashBearingModel,
    exact: true,
  })
  await expect(slashBearingModelOption).toBeVisible()
  await slashBearingModelOption.click({ force: true })
  await expect(defaultModel).toContainText(slashBearingModel)

  const v7DownloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download Kilo 7.x settings" }).click()
  const v7Download = await v7DownloadPromise

  expect(v7Download.suggestedFilename()).toBe("kilo-settings.json")
  const v7DownloadPath = await v7Download.path()
  if (!v7DownloadPath) {
    throw new Error(
      "Kilo Code settings export did not produce a readable download",
    )
  }

  const v7Settings = JSON.parse(await fs.readFile(v7DownloadPath, "utf8")) as {
    _meta?: { version?: number }
    provider?: Record<
      string,
      {
        name?: string
        npm?: string
        models?: Record<string, { name?: string }>
        options?: { apiKey?: string; baseURL?: string }
      }
    >
    model?: string
  }

  expect(v7Settings._meta?.version).toBe(1)
  const providerEntries = Object.entries(v7Settings.provider ?? {})
  expect(providerEntries).toHaveLength(1)
  const [providerId, provider] = providerEntries[0]
  expect(provider.name).toBe(profileName)
  expect(providerId).not.toBe(profileName)
  expect(provider).toMatchObject({
    npm: "@ai-sdk/openai-compatible",
    models: {
      [modelIds[0]]: { name: modelIds[0] },
      [modelIds[1]]: { name: modelIds[1] },
      [modelIds[2]]: { name: modelIds[2] },
    },
    options: {
      apiKey: "sk-kilo-export-profile",
      baseURL: `${profileBaseUrl}/v1`,
    },
  })

  expect(v7Settings.model).toBe(`${providerId}/${slashBearingModel}`)
  expect(
    v7Settings.provider?.[providerId]?.models?.[slashBearingModel],
  ).toEqual({ name: slashBearingModel })

  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(page.getByText("Export Kilo Code JSON")).toHaveCount(0)
  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.exportMenuButton)
    .click()
  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.exportToKiloCodeMenuItem)
    .click()
  await expect(page.getByText("Export Kilo Code JSON")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Download Kilo 7.x settings" }),
  ).toBeEnabled()

  const exportTarget = page.getByRole("combobox", { name: "Export target" })
  const legacyTargetName = "Roo Code / Kilo Code 5.x (legacy)"
  await exportTarget.click()
  await page.getByRole("option", { name: legacyTargetName }).click()
  await expect(exportTarget).toContainText(legacyTargetName)

  const legacyDownloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download legacy settings" }).click()
  const legacyDownload = await legacyDownloadPromise

  expect(legacyDownload.suggestedFilename()).toBe("kilo-code-settings.json")
  const legacyDownloadPath = await legacyDownload.path()
  if (!legacyDownloadPath) {
    throw new Error(
      "Legacy Kilo Code settings export did not produce a readable download",
    )
  }

  const legacySettings = JSON.parse(
    await fs.readFile(legacyDownloadPath, "utf8"),
  ) as {
    providerProfiles?: {
      currentApiConfigName?: string
      apiConfigs?: Record<
        string,
        {
          id?: string
          apiProvider?: string
          openAiBaseUrl?: string
          openAiApiKey?: string
          openAiModelId?: string
        }
      >
    }
  }

  const legacyProfileName = `${profileName} - API Key`
  expect(legacySettings.providerProfiles?.currentApiConfigName).toBe(
    legacyProfileName,
  )
  expect(
    legacySettings.providerProfiles?.apiConfigs?.[legacyProfileName],
  ).toMatchObject({
    apiProvider: "openai",
    openAiBaseUrl: `${profileBaseUrl}/v1`,
    openAiApiKey: "sk-kilo-export-profile",
    openAiModelId: modelIds[0],
  })
  expect(
    legacySettings.providerProfiles?.apiConfigs?.[legacyProfileName]?.id,
  ).toEqual(expect.any(String))
})

test("imports an API credential profile into CLI Proxy", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    cliProxy: {
      baseUrl: "https://cli-proxy.example.com/v0/management",
      managementKey: "mgmt-cli-proxy",
    },
  })
  await seedApiCredentialProfiles(serviceWorker, [
    createStoredApiCredentialProfile({
      id: "profile-cli-proxy",
      name: "CLI Proxy Profile",
      baseUrl: "https://cli-source.example.com",
      apiKey: "sk-cli-proxy-profile",
    }),
  ])

  await installOpenAiCompatibleModelsRoute(context, {
    baseUrl: "https://cli-source.example.com",
    modelId: "gpt-cli-proxy",
  })
  await context.route(
    "https://cli-proxy.example.com/v0/management/openai-compatibility",
    async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ "openai-compatibility": [] }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      })
    },
  )

  await openProfilesPage(page, extensionId)

  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.exportMenuButton)
    .click()
  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.exportToCliProxyMenuItem)
    .click()

  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("Import to CLIProxyAPI")).toBeVisible()
  await expect(page.getByLabel("Provider name")).toHaveValue(
    "CLI Proxy Profile",
  )
  await expect(page.getByLabel("Provider base URL")).toHaveValue(
    "https://cli-source.example.com/v1",
  )

  const importRequestPromise = page.waitForRequest((request) => {
    return (
      request.method() === "PUT" &&
      request.url() ===
        "https://cli-proxy.example.com/v0/management/openai-compatibility"
    )
  })
  await dialog.getByRole("button", { name: "Import", exact: true }).click()
  const importRequest = await importRequestPromise

  expect(importRequest.headers()["authorization"]).toBe("Bearer mgmt-cli-proxy")
  expect(JSON.parse(importRequest.postData() ?? "[]")).toEqual([
    {
      name: "CLI Proxy Profile",
      "base-url": "https://cli-source.example.com/v1",
      "api-key-entries": [
        {
          "api-key": "sk-cli-proxy-profile",
          "proxy-url": "",
        },
      ],
      headers: {},
    },
  ])
  await expect(
    page.getByText(
      "Successfully imported provider CLI Proxy Profile to CLIProxyAPI",
    ),
  ).toBeVisible()
})

test("imports an API credential profile into Claude Code Router", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  const routerConfigRequests: Array<{
    method: string
    authorization?: string
    body: unknown
  }> = []
  const restartRequests: Array<{ authorization?: string }> = []
  let sourceModelsRequested = false

  await seedUserPreferences(serviceWorker, {
    claudeCodeRouter: {
      baseUrl: "https://router.example.invalid",
      apiKey: "mgmt-claude-router",
    },
  })
  await seedApiCredentialProfiles(serviceWorker, [
    createStoredApiCredentialProfile({
      id: "profile-claude-code-router",
      name: "Claude Router Profile",
      baseUrl: "https://claude-source.example.invalid",
      apiKey: "sk-claude-router-profile",
    }),
  ])

  await installOpenAiCompatibleModelsRoute(context, {
    baseUrl: "https://claude-source.example.invalid",
    modelId: "gpt-claude-router-profile",
    onRequest: () => {
      sourceModelsRequested = true
    },
  })
  await context.route(
    "https://router.example.invalid/api/config",
    async (route) => {
      const request = route.request()

      if (request.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            LOG: true,
            Providers: [
              {
                name: "Existing Provider",
                api_base_url:
                  "https://existing.example.invalid/v1/chat/completions",
                api_key: "sk-existing",
                models: ["existing-model"],
              },
            ],
          }),
        })
        return
      }

      routerConfigRequests.push({
        method: request.method(),
        authorization: request.headers()["authorization"],
        body: JSON.parse(request.postData() ?? "{}"),
      })
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      })
    },
  )
  await context.route(
    "https://router.example.invalid/api/restart",
    async (route) => {
      restartRequests.push({
        authorization: route.request().headers()["authorization"],
      })
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      })
    },
  )

  await openProfilesPage(page, extensionId)

  await page
    .getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.exportMenuButton)
    .click()
  await page
    .getByTestId(
      API_CREDENTIAL_PROFILES_TEST_IDS.exportToClaudeCodeRouterMenuItem,
    )
    .click()

  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("Import to Claude Code Router")).toBeVisible()
  await expect(page.getByLabel("Provider name")).toHaveValue(
    "Claude Router Profile",
  )
  await expect(page.getByLabel("Provider API endpoint")).toHaveValue(
    "https://claude-source.example.invalid/v1/chat/completions",
  )

  const modelsInput = dialog.getByPlaceholder("Type to add models")
  await expect(modelsInput).toBeVisible()
  await expect.poll(() => sourceModelsRequested).toBe(true)
  await modelsInput.fill("gpt-claude-router-profile")
  await page.keyboard.press("Enter")
  await expect(
    dialog.getByRole("button", {
      name: "Copy gpt-claude-router-profile",
    }),
  ).toBeVisible()

  await dialog.getByRole("button", { name: "Import", exact: true }).click()

  await expect
    .poll(() => routerConfigRequests)
    .toEqual([
      {
        method: "POST",
        authorization: "Bearer mgmt-claude-router",
        body: {
          LOG: true,
          Providers: [
            {
              name: "Existing Provider",
              api_base_url:
                "https://existing.example.invalid/v1/chat/completions",
              api_key: "sk-existing",
              models: ["existing-model"],
            },
            {
              name: "Claude Router Profile",
              api_base_url:
                "https://claude-source.example.invalid/v1/chat/completions",
              api_key: "sk-claude-router-profile",
              models: ["gpt-claude-router-profile"],
            },
          ],
        },
      },
    ])
  await expect
    .poll(() => restartRequests)
    .toEqual([
      {
        authorization: "Bearer mgmt-claude-router",
      },
    ])
  await expect(
    page.getByText(
      "Successfully imported provider Claude Router Profile to Claude Code Router",
    ),
  ).toBeVisible()
})
