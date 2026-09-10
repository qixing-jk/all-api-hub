import { randomUUID } from "node:crypto"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import {
  getManagedSiteChannelRowDeleteActionTestId,
  getManagedSiteChannelRowEditActionTestId,
  MANAGED_SITE_CHANNELS_TEST_IDS,
} from "~/features/ManagedSiteChannels/testIds"
import {
  cliProxyApiManagementUrl,
  type CliProxyApiProvider,
} from "~/services/apiService/cliProxyApi"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  channelRowByName,
  openManagedSiteChannelRowActions,
} from "~~/e2e/scenarios/managedSiteChannels"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import {
  getManagedSiteRealSiteSkipReason,
  resolveCliProxyApiConfig,
} from "~~/e2e/utils/realSite/managedSiteConfig"
import { runScenarioWithCleanup } from "~~/e2e/utils/scenarioErrors"

const resolved = resolveCliProxyApiConfig()
// Collection PUTs have no compare-and-swap support, so use one writer per deployment.
test.describe.configure({ mode: "default", timeout: 120_000 })
test.use({
  trace: "off",
  video: "off",
  screenshot: "off",
  actionTimeout: 15_000,
})

const providers = [
  ["openai-compatibility", "OpenAI Compatibility"],
  ["codex-api-key", "Codex"],
  ["claude-api-key", "Claude"],
  ["gemini-api-key", "Gemini"],
  ["vertex-api-key", "Vertex AI"],
  ["xai-api-key", "xAI"],
  ["interactions-api-key", "Gemini Interactions"],
] as const

test.describe("real-site E2E: CLIProxyAPI providers", () => {
  test.skip(
    !resolved.config,
    getManagedSiteRealSiteSkipReason({
      label: "CLIProxyAPI",
      missingEnvKeys: resolved.missingEnvKeys,
    }),
  )
  for (const [kind, label] of providers) {
    test(`${label}: create, search, edit models and ${kind === "openai-compatibility" ? "multiple keys" : "key"}, preserve fields, delete`, async ({
      context,
      page,
      extensionId,
    }) => {
      test.skip(
        !resolved.config,
        getManagedSiteRealSiteSkipReason({
          label: "CLIProxyAPI",
          missingEnvKeys: resolved.missingEnvKeys,
        }),
      )
      const config = resolved.config!
      const endpoint = `${cliProxyApiManagementUrl(config.baseUrl).href}/${kind}`
      const headers = { Authorization: `Bearer ${config.adminToken}` }
      const preflight = await context.request.get(endpoint, { headers })
      test.skip(
        preflight.status() === 404 &&
          ["vertex-api-key", "xai-api-key", "interactions-api-key"].includes(
            kind,
          ),
        `${label} is not exposed by this CLIProxyAPI version`,
      )
      expect(preflight.status(), "Management inventory must be readable").toBe(
        200,
      )
      const runId = randomUUID()
      const name = `AAH E2E CLIProxyAPI ${runId}`
      const baseUrl = `https://aah-e2e-${runId}.example.invalid/v1`
      const displayName = kind === "openai-compatibility" ? name : baseUrl
      const key = `sk-aah-e2e-${runId}`
      const read = async (): Promise<CliProxyApiProvider[]> => {
        const response = await context.request.get(endpoint, { headers })
        expect(response.status(), "Management inventory read").toBe(200)
        const body = await response.json()
        const items = body[kind] ?? []
        expect(Array.isArray(items), "Native collection envelope").toBe(true)
        return items
      }
      const owns = (item: CliProxyApiProvider) =>
        item["base-url"] === baseUrl &&
        (kind !== "openai-compatibility" || item.name === name)
      await forceExtensionLanguage(page, "en")
      await stubLlmMetadataIndex(context)
      await seedUserPreferences(await getServiceWorker(context), {
        managedSiteType: SITE_TYPES.CLI_PROXY_API,
        cliProxyApi: config,
        openChangelogOnUpdate: false,
      })
      await runScenarioWithCleanup({
        run: async () => {
          await page.goto(
            `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.MANAGED_SITE_CHANNELS}`,
          )
          await waitForExtensionRoot(page)
          await page
            .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.addChannelButton)
            .click()
          const dialog = page.getByRole("dialog")
          await dialog.getByRole("combobox", { name: "Channel Type" }).click()
          await page.getByRole("option", { name: label, exact: true }).click()
          if (kind === "openai-compatibility")
            await dialog.getByLabel("Channel Name", { exact: true }).fill(name)
          await dialog.getByLabel("Base URL", { exact: true }).fill(baseUrl)
          await dialog.getByLabel(/^API Key/).fill(key)
          await dialog
            .getByLabel("Available Models", { exact: true })
            .fill("aah-test-model = aah-test-alias")
          await dialog
            .getByLabel("Request headers", { exact: true })
            .fill("X-AAH-E2E: preserve")
          await dialog
            .getByLabel("Proxy URL", { exact: true })
            .fill("socks5://127.0.0.1:9")
          if (kind === "openai-compatibility") {
            await dialog.getByLabel("Weight", { exact: true }).fill("4")
            await dialog
              .getByRole("button", { name: "Add key", exact: true })
              .click()
            const second = dialog.getByRole("group", {
              name: "API Key 2",
              exact: true,
            })
            await second
              .getByLabel("API Key 2", { exact: true })
              .fill(`${key}-second`)
            await second
              .getByLabel("Proxy URL", { exact: true })
              .fill("http://127.0.0.1:10")
            await second.getByLabel("Weight", { exact: true }).fill("2")
            await dialog
              .getByRole("button", { name: "Add key", exact: true })
              .click()
            const third = dialog.getByRole("group", {
              name: "API Key 3",
              exact: true,
            })
            await third
              .getByLabel("API Key 3", { exact: true })
              .fill(`${key}-third`)
            await third
              .getByLabel("Proxy URL", { exact: true })
              .fill("socks5h://127.0.0.1:11")
            await third.getByLabel("Weight", { exact: true }).fill("7")
          }
          await dialog
            .getByRole("button", { name: "Create Channel", exact: true })
            .click()
          await expect(dialog).toBeHidden()
          await page
            .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.searchInput)
            .fill(baseUrl)
          await expect(channelRowByName(page, displayName)).toHaveCount(1)
          const action = await openManagedSiteChannelRowActions(
            page,
            displayName,
          )
          await page
            .getByTestId(
              getManagedSiteChannelRowEditActionTestId(action.rowTestToken),
            )
            .click()
          await dialog
            .getByLabel("Available Models", { exact: true })
            .fill("aah-replacement = aah-replacement-alias")
          if (kind === "openai-compatibility") {
            const first = dialog.getByRole("group", {
              name: "API Key 1",
              exact: true,
            })
            const third = dialog.getByRole("group", {
              name: "API Key 3",
              exact: true,
            })
            await expect(
              first.getByLabel("API Key 1", { exact: true }),
            ).toHaveValue("")
            await first
              .getByRole("button", { name: "Show key", exact: true })
              .click()
            expect(
              (await first
                .getByLabel("API Key 1", { exact: true })
                .inputValue()) === key,
              "First saved key revealed",
            ).toBe(true)
            await third
              .getByRole("button", { name: "Show key", exact: true })
              .click()
            expect(
              (await third
                .getByLabel("API Key 3", { exact: true })
                .inputValue()) === `${key}-third`,
              "Third saved key revealed independently",
            ).toBe(true)
            await first
              .getByLabel("API Key 1", { exact: true })
              .fill(`${key}-rotated`)
            await dialog
              .getByRole("group", { name: "API Key 2", exact: true })
              .getByRole("button", { name: "Remove key", exact: true })
              .click()
            await dialog
              .getByRole("button", { name: "Add key", exact: true })
              .click()
            const added = dialog.getByRole("group", {
              name: "API Key 3",
              exact: true,
            })
            await added
              .getByLabel("API Key 3", { exact: true })
              .fill(`${key}-added`)
            await added
              .getByLabel("Proxy URL", { exact: true })
              .fill("http://127.0.0.1:12")
            await added.getByLabel("Weight", { exact: true }).fill("3")
          } else {
            await dialog.getByLabel(/^API Key/).fill(`${key}-rotated`)
          }
          await dialog
            .getByRole("button", { name: "Save Changes", exact: true })
            .click()
          await expect(dialog).toBeHidden()
          await expect(channelRowByName(page, displayName)).toHaveCount(1)
          const matches = (await read()).filter(owns)
          expect(matches.length).toBe(1)
          const saved = matches[0]
          // Compare booleans for credentials so assertion reports cannot expose server keys.
          const savedKey =
            kind === "openai-compatibility"
              ? saved["api-key-entries"]?.[0]?.["api-key"]
              : saved["api-key"]
          expect(
            savedKey === `${key}-rotated`,
            "Rotated credential persisted",
          ).toBe(true)
          if (kind === "openai-compatibility") {
            const entries = saved["api-key-entries"] ?? []
            expect(
              entries.length,
              "Only the intended three credentials remain",
            ).toBe(3)
            expect(
              entries[1]["api-key"] === `${key}-third`,
              "Untouched credential preserved",
            ).toBe(true)
            expect(
              entries[2]["api-key"] === `${key}-added`,
              "Added credential persisted",
            ).toBe(true)
            expect(
              entries.map((entry) => ({
                proxy: entry["proxy-url"],
                weight: entry.weight,
              })),
            ).toEqual([
              { proxy: "socks5://127.0.0.1:9", weight: 4 },
              { proxy: "socks5h://127.0.0.1:11", weight: 7 },
              { proxy: "http://127.0.0.1:12", weight: 3 },
            ])
          }
          expect(saved.models).toEqual([
            { name: "aah-replacement", alias: "aah-replacement-alias" },
          ])
          expect(saved.headers).toEqual({ "X-AAH-E2E": "preserve" })
          const proxy =
            kind === "openai-compatibility"
              ? saved["api-key-entries"]?.[0]?.["proxy-url"]
              : saved["proxy-url"]
          expect(proxy).toBe("socks5://127.0.0.1:9")
          if (kind === "openai-compatibility") {
            const staleAction = await openManagedSiteChannelRowActions(
              page,
              displayName,
            )
            await page
              .getByTestId(
                getManagedSiteChannelRowEditActionTestId(
                  staleAction.rowTestToken,
                ),
              )
              .click()
            const current = await read()
            const currentIndex = current.findIndex(owns)
            expect(currentIndex).toBeGreaterThanOrEqual(0)
            const external = await context.request.patch(endpoint, {
              headers,
              data: {
                index: currentIndex,
                value: {
                  "api-key-entries": current[currentIndex][
                    "api-key-entries"
                  ]!.map((entry, index) =>
                    index === 1 ? { ...entry, weight: 9 } : entry,
                  ),
                },
              },
            })
            expect(
              external.status(),
              "Other client updates credential weight",
            ).toBe(200)
            await dialog
              .getByLabel("Channel Name", { exact: true })
              .fill(`${name}-stale`)
            await dialog
              .getByRole("button", { name: "Save Changes", exact: true })
              .click()
            await expect(
              page.getByText(
                "This channel changed while you were editing. Your changes were not saved. Close the editor, refresh the channel list, and edit again.",
                { exact: true },
              ),
            ).toBeVisible()
            await expect(page.getByRole("dialog")).toHaveCount(1)
            await expect(
              dialog.getByLabel("Channel Name", { exact: true }),
            ).toHaveValue(`${name}-stale`)
            await dialog
              .getByRole("button", { name: "Cancel", exact: true })
              .click()
            await page.reload()
            await waitForExtensionRoot(page)
            await page
              .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.searchInput)
              .fill(baseUrl)
            await expect(channelRowByName(page, displayName)).toHaveCount(1)
            const preserved = (await read()).find(owns)!
            expect(
              preserved["api-key-entries"]?.[1]?.weight,
              "External edit survives rejected save and browser reload",
            ).toBe(9)
          }
          const updated = await openManagedSiteChannelRowActions(
            page,
            displayName,
          )
          await page
            .getByTestId(
              getManagedSiteChannelRowDeleteActionTestId(updated.rowTestToken),
            )
            .click()
          await page
            .getByTestId(
              MANAGED_SITE_CHANNELS_TEST_IDS.deleteChannelConfirmButton,
            )
            .click()
          await expect(channelRowByName(page, displayName)).toHaveCount(0)
          expect(
            (await read()).some(owns),
            "Deleted provider must be absent upstream",
          ).toBe(false)
        },
        finalizers: [
          async () => {
            const items = await read()
            const index = items.findIndex(owns)
            if (index < 0) return
            const response = await context.request.delete(
              `${endpoint}?index=${index}`,
              { headers },
            )
            expect(response.status(), "Cleanup of this run's provider").toBe(
              200,
            )
            expect((await read()).some(owns), "Cleanup confirmed").toBe(false)
          },
        ],
        cleanupMessage: "CLIProxyAPI test-provider cleanup failed",
        failureMessage: "CLIProxyAPI real-site provider scenario failed",
      })
    })
  }
})
