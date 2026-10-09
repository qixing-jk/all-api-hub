import { randomUUID } from "node:crypto"

import { SITE_TYPES } from "~/constants/siteType"
import { CHANNEL_DIALOG_TEST_IDS } from "~/features/ManagedSiteChannels/editor/ChannelDialog/testIds"
import {
  getManagedSiteChannelRowDeleteActionTestId,
  getManagedSiteChannelRowEditActionTestId,
  MANAGED_SITE_CHANNELS_TEST_IDS,
} from "~/features/ManagedSiteChannels/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { openManagedSiteChannelRowActions } from "~~/e2e/scenarios/managedSiteChannels"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import {
  getManagedSiteRealSiteSkipReason,
  resolveGptLoadManagedSiteConfig,
} from "~~/e2e/utils/realSite/managedSiteConfig"
import { runScenarioWithCleanup } from "~~/e2e/utils/scenarioErrors"

const resolved = resolveGptLoadManagedSiteConfig()
test.use({
  trace: "off",
  screenshot: "off",
  video: "off",
  actionTimeout: 15_000,
})

test("gpt-load persists group edits, multiple keys and models, then deletes only run-owned resources", async ({
  context,
  page,
  extensionId,
}, testInfo) => {
  test.setTimeout(180_000)
  test.skip(
    !resolved.config,
    getManagedSiteRealSiteSkipReason({
      label: "gpt-load",
      missingEnvKeys: resolved.missingEnvKeys,
    }),
  )
  const config = resolved.config!
  const root = config.baseUrl.replace(/\/+$/, "")
  const headers = { Authorization: `Bearer ${config.managementKey}` }
  const name = `AAH E2E gpt-load ${randomUUID()}`
  const renamed = `${name} renamed`
  const upstream = "https://aah-e2e.example.invalid/v1"
  const keys = [randomUUID(), randomUUID()].map(
    (value) => `sk-aah-nonfunctional-${value}`,
  )
  const model = `aah-e2e-${randomUUID()}`
  let groupId: number | undefined

  // Independent native readback: do not reuse the adapter being tested.
  const read = async (path: string) => {
    const response = await context.request.get(`${root}${path}`, { headers })
    expect(response.ok()).toBe(true)
    const body = await response.json()
    expect(body.code).toBe(0)
    return body.data
  }
  const inventory = async (): Promise<Array<{ id: number; name: string }>> =>
    (await read("/api/modern/groups")).items
  const session = await read("/api/auth/session")
  expect(session.principal_type).toBe("admin")
  const info = await read("/api/system/info")
  testInfo.annotations.push({
    type: "backend-version",
    description: String(info.version ?? "unknown"),
  })
  const beforeIds = (await inventory())
    .map((group) => group.id)
    .sort((a, b) => a - b)

  // Capture the assigned ID before any UI assertion, including a failed save.
  const captureCreate = async (
    response: import("@playwright/test").Response,
  ) => {
    if (
      response.request().method() !== "POST" ||
      response.url() !== `${root}/api/groups`
    )
      return
    const request = response.request().postDataJSON()
    if (request?.name !== name) return
    const body = await response.json()
    if (Number.isSafeInteger(body.data?.group_id)) groupId = body.data.group_id
  }
  page.on("response", captureCreate)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await seedUserPreferences(await getServiceWorker(context), {
    managedSiteType: SITE_TYPES.GPT_LOAD,
    gptLoad: config,
    autoCheckin: { globalEnabled: false, pretriggerDailyOnUiOpen: false },
    openChangelogOnUpdate: false,
  })

  await runScenarioWithCleanup({
    run: async () => {
      await page.goto(
        `chrome-extension://${extensionId}/options.html#managedSiteChannels`,
      )
      await page
        .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.addChannelButton)
        .click()
      const dialog = page.getByRole("dialog")
      await dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput).fill(name)
      await dialog
        .getByTestId(CHANNEL_DIALOG_TEST_IDS.baseUrlInput)
        .fill(upstream)
      await dialog.getByTestId("key-secret-input-0").fill(keys[0]!)
      await dialog.getByRole("button", { name: "Add key", exact: true }).click()
      await dialog.getByTestId("key-secret-input-1").fill(keys[1]!)
      const models = dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.modelsInput)
      await models.fill(model)
      await models.press("Enter")
      await dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton).click()
      await expect(dialog).toBeHidden({ timeout: 30_000 })
      await expect
        .poll(async () => {
          groupId ??= (await inventory()).find(
            (group) => group.name === name,
          )?.id
          return groupId !== undefined
        })
        .toBe(true)
      const saved = await read(`/api/groups/${groupId}/settings`)
      expect(saved.name).toBe(name)
      expect(saved.params.base_url).toBe(upstream)
      const initialCredentials = await read(
        `/api/groups/${groupId}/credentials?page=1&page_size=100`,
      )
      expect(initialCredentials.items.length).toBe(2)
      expect(
        (await read(`/api/groups/${groupId}/models`)).items.map(
          (item: { id: string }) => item.id,
        ),
      ).toEqual([model])

      await page
        .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.searchInput)
        .fill(name)
      const edit = await openManagedSiteChannelRowActions(page, name)
      await page
        .getByTestId(
          getManagedSiteChannelRowEditActionTestId(edit.rowTestToken),
        )
        .click()
      await dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput).fill(renamed)
      await dialog.getByRole("button", { name: "Add key", exact: true }).click()
      await dialog
        .getByTestId("key-secret-input-2")
        .fill(`sk-aah-nonfunctional-${randomUUID()}`)
      await dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton).click()
      await expect(dialog).toBeHidden({ timeout: 30_000 })
      const updated = await read(`/api/groups/${groupId}/settings`)
      expect(updated.name).toBe(renamed)
      expect(updated.params).toEqual(saved.params)
      expect(updated.price_multiplier).toEqual(saved.price_multiplier)
      expect(updated.channel_id).toEqual(saved.channel_id)
      const credentials = await read(
        `/api/groups/${groupId}/credentials?page=1&page_size=100`,
      )
      expect(credentials.items.length).toBe(3)
      expect(
        credentials.items
          .slice(0, 2)
          .map((item: { credential_id: number }) => item.credential_id),
      ).toEqual(
        initialCredentials.items.map(
          (item: { credential_id: number }) => item.credential_id,
        ),
      )
      expect(
        (await read(`/api/groups/${groupId}/models`)).items.map(
          (item: { id: string }) => item.id,
        ),
      ).toEqual([model])

      // Saving scalar settings without touching the key list must preserve it.
      const settingsOnly = await openManagedSiteChannelRowActions(page, renamed)
      await page
        .getByTestId(
          getManagedSiteChannelRowEditActionTestId(settingsOnly.rowTestToken),
        )
        .click()
      await dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput).fill(name)
      await dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton).click()
      await expect(dialog).toBeHidden({ timeout: 30_000 })
      expect((await read(`/api/groups/${groupId}/settings`)).name).toBe(name)
      expect(
        (
          await read(`/api/groups/${groupId}/credentials?page=1&page_size=100`)
        ).items.map((item: { credential_id: number }) => item.credential_id),
      ).toEqual(
        credentials.items.map(
          (item: { credential_id: number }) => item.credential_id,
        ),
      )

      const remove = await openManagedSiteChannelRowActions(page, name)
      await page
        .getByTestId(
          getManagedSiteChannelRowDeleteActionTestId(remove.rowTestToken),
        )
        .click()
      await page
        .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.deleteChannelConfirmButton)
        .click()
      await expect
        .poll(async () =>
          (await inventory()).some((group) => group.id === groupId),
        )
        .toBe(false)
    },
    finalizers: [
      async () => {
        page.off("response", captureCreate)
        // A response lost before ID capture is recovered by this exact run name.
        groupId ??= (await inventory()).find(
          (group) => group.name === name || group.name === renamed,
        )?.id
        if (
          groupId !== undefined &&
          (await inventory()).some((group) => group.id === groupId)
        ) {
          const response = await context.request.delete(
            `${root}/api/groups/${groupId}`,
            { headers, data: {} },
          )
          expect(response.ok()).toBe(true)
        }
        expect(
          (await inventory()).map((group) => group.id).sort((a, b) => a - b),
        ).toEqual(beforeIds)
      },
    ],
    cleanupMessage: "gpt-load run-owned group cleanup failed",
    failureMessage: "gpt-load real-site persistence failed",
  })
})
