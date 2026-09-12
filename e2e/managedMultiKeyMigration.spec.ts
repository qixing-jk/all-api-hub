import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_SITE_CHANNELS_TEST_IDS } from "~/features/ManagedSiteChannels/testIds"
import type { CliProxyApiProvider } from "~/services/apiService/cliProxyApi"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { openInterceptedAxonHubManagedSiteChannels } from "~~/e2e/fixtures/managedSiteChannelsIntercepted"
import { openManagedSiteChannelRowActions } from "~~/e2e/scenarios/managedSiteChannels"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const keys = ["migration-first-placeholder", "migration-second-placeholder"]

test("opens CLIProxyAPI source migration after another target is configured", async ({
  context,
  page,
  extensionId,
}) => {
  const origin = "https://cliproxy-source.example.invalid"
  const provider: CliProxyApiProvider = {
    name: "CLI migration source",
    "base-url": "https://upstream.example.invalid/v1",
    models: [{ name: "example-model" }],
    "api-key-entries": keys.map((key) => ({ "api-key": key })),
  }
  await context.route(`${origin}/**`, async (route) => {
    const kind = new URL(route.request().url()).pathname.split("/").pop()!
    await route.fulfill({
      json: { [kind]: kind === "openai-compatibility" ? [provider] : [] },
    })
  })
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  const sourcePreferences = {
    managedSiteType: SITE_TYPES.CLI_PROXY_API,
    cliProxyApi: { baseUrl: origin, adminToken: "fixture-token" },
    openChangelogOnUpdate: false,
  }
  await seedUserPreferences(worker, sourcePreferences)
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.MANAGED_SITE_CHANNELS}`,
  )
  await waitForExtensionRoot(page)
  await expect(page.getByText(provider.name!, { exact: true })).toBeVisible()
  const migrationMode = page.getByTestId(
    MANAGED_SITE_CHANNELS_TEST_IDS.migrationModeButton,
  )
  await expect(migrationMode).toHaveCount(0)

  await seedUserPreferences(worker, {
    ...sourcePreferences,
    doneHub: {
      baseUrl: "https://migration-target.example.invalid",
      adminToken: "fixture-admin",
      userId: "1",
    },
  })
  await page.reload()
  await expect(migrationMode).toBeEnabled()
  await migrationMode.click()
  await openManagedSiteChannelRowActions(page, provider.name!)
  await page
    .getByRole("menuitem", { name: "Migrate to another site", exact: true })
    .click()
  const dialog = page.getByRole("dialog", { name: "Dialog" })
  await expect(
    dialog.getByRole("button", { name: "Start migration", exact: true }),
  ).toBeEnabled()
  for (const index of [1, 2]) {
    await expect(
      dialog.getByRole("button", {
        name: new RegExp(`CLI migration source \\[Key ${index}\\]`),
      }),
    ).toBeVisible()
  }
  for (const key of keys) await expect(dialog).not.toContainText(key)
})

for (const target of ["grouped", "split"] as const) {
  test(`migrates every key through the ${target} preview and result flow`, async ({
    context,
    page,
    extensionId,
  }, testInfo) => {
    await stubLlmMetadataIndex(context)
    const targetOrigin = "https://migration-target.example.invalid"
    let providers: CliProxyApiProvider[] = []
    const channels: Record<string, unknown>[] = []
    const requests: Record<string, unknown>[] = []
    await context.route(`${targetOrigin}/**`, async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      if (target === "grouped") {
        const kind = path.split("/").pop()!
        if (request.method() === "PUT") {
          providers = request.postDataJSON()
          requests.push({ providers })
          await route.fulfill({ json: { status: "ok" } })
        } else
          await route.fulfill({
            json: { [kind]: kind === "openai-compatibility" ? providers : [] },
          })
        return
      }
      if (path === "/api/channel/" && request.method() === "POST") {
        const body = request.postDataJSON()
        requests.push(body)
        if (requests.length === 2) {
          await route.fulfill({
            json: { success: false, message: "fixture rejection" },
          })
          return
        }
        channels.push({ ...(body.channel ?? body), id: 800 + requests.length })
        await route.fulfill({ json: { success: true, message: "ok" } })
        return
      }
      if (path === "/api/channel/" && request.method() === "GET") {
        await route.fulfill({
          json: {
            success: true,
            data: {
              data: channels,
              page: 1,
              size: 100,
              total_count: channels.length,
            },
          },
        })
        return
      }
      await route.fulfill({
        status: 404,
        body: "Unconfigured fixture endpoint",
      })
    })
    await openInterceptedAxonHubManagedSiteChannels({
      context,
      page,
      extensionId,
      apiKeys: keys,
    })
    await seedUserPreferences(await getServiceWorker(context), {
      managedSiteType: SITE_TYPES.AXON_HUB,
      axonHub: {
        baseUrl: "https://axonhub.example.invalid",
        email: "admin@example.invalid",
        password: "fixture-password",
      },
      ...(target === "grouped"
        ? {
            cliProxyApi: { baseUrl: targetOrigin, adminToken: "fixture-admin" },
          }
        : {
            doneHub: {
              baseUrl: targetOrigin,
              adminToken: "fixture-admin",
              userId: "1",
            },
          }),
    })
    await page.reload()
    await page
      .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.migrationModeButton)
      .click()
    await openManagedSiteChannelRowActions(page, "Example primary")
    await page
      .getByRole("menuitem", { name: "Migrate to another site", exact: true })
      .click()
    const dialog = page.getByRole("dialog", { name: "Dialog" })
    if (target === "grouped") {
      const selector = dialog.getByRole("combobox", {
        name: "Migration target",
      })
      if (!(await selector.textContent())?.includes("CLIProxyAPI")) {
        await selector.click()
        await page
          .getByRole("option", { name: "CLIProxyAPI", exact: true })
          .click()
      }
    }
    const start = dialog.getByRole("button", {
      name: "Start migration",
      exact: true,
    })
    await expect(start).toBeEnabled()
    await dialog
      .getByRole("button", {
        name:
          target === "split" ? /Example primary \[Key 1\]/ : /Example primary/,
      })
      .click()
    await expect(dialog.getByText("Key count", { exact: true })).toBeVisible()
    if (target === "split") {
      await expect(
        dialog.getByRole("button", { name: /Example primary \[Key 2\]/ }),
      ).toBeVisible()
      await expect(dialog).toContainText(
        "A separate channel will be created for each key",
      )
    }
    for (const key of keys) await expect(dialog).not.toContainText(key)
    await dialog.screenshot({
      path: testInfo.outputPath(`${target}-preview.png`),
    })
    await start.click()
    await page
      .getByRole("button", { name: "Confirm migration", exact: true })
      .click()
    await expect(dialog).toContainText("Migration results")
    await expect.poll(() => requests.length).toBe(target === "grouped" ? 1 : 2)
    if (target === "grouped") {
      expect(providers).toHaveLength(1)
      expect(
        providers[0]["api-key-entries"]?.map((entry) => entry["api-key"]),
      ).toEqual(keys)
      await expect(dialog).toContainText("1 created")
    } else {
      expect(
        requests.map(
          (request) =>
            ((request.channel ?? request) as Record<string, unknown>).key,
        ),
      ).toEqual(keys)
      await expect(dialog).toContainText("1 created")
      await expect(dialog).toContainText("1 failed")
    }
    for (const key of keys) await expect(dialog).not.toContainText(key)
    await dialog.screenshot({
      path: testInfo.outputPath(`${target}-result.png`),
    })
  })
}
