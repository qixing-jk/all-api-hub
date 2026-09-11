import { randomUUID } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import type { BrowserContext, Page } from "@playwright/test"

import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { MANAGED_SITE_CHANNELS_TEST_IDS } from "~/features/ManagedSiteChannels/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { openManagedSiteChannelRowActions } from "~~/e2e/scenarios/managedSiteChannels"
import { runScenarioWithCleanup } from "~~/e2e/utils/scenarioErrors"

type Snapshot = Record<string, unknown>

const editedFields = new Set([
  "test_model",
  "auto_ban",
  "model_mapping",
  "tag",
  "remark",
  "setting",
  "settings",
  "updated_at",
  "updatedAt",
])
const detectionFields = new Set([
  "upstream_model_update_check_enabled",
  "upstream_model_update_auto_sync_enabled",
  "upstream_model_update_ignored_models",
])

function jsonObject(value: unknown): Snapshot {
  return value ? JSON.parse(String(value)) : {}
}

/** Only field names reach failure output; real channel snapshots stay in memory. */
function assertPreserved(before: Snapshot, after: Snapshot) {
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!editedFields.has(key) && !isDeepStrictEqual(before[key], after[key])) {
      throw new Error(`Unedited channel field changed: ${key}`)
    }
  }
  for (const [field, excluded] of [
    ["setting", new Set(["proxy"])],
    ["settings", detectionFields],
  ] as const) {
    const previous = jsonObject(before[field])
    const current = jsonObject(after[field])
    for (const key of new Set([
      ...Object.keys(previous),
      ...Object.keys(current),
    ])) {
      if (
        !excluded.has(key) &&
        !isDeepStrictEqual(previous[key], current[key])
      ) {
        throw new Error(`Unedited channel field changed: ${field}.${key}`)
      }
    }
  }
}

/** Real persistence coverage using one run-owned, disabled channel and no model calls. */
export async function runNewApiAdvancedChannelScenario(params: {
  context: BrowserContext
  page: Page
  extensionId: string
  config: { baseUrl: string; adminToken: string; userId: string }
}) {
  const { context, page, extensionId, config } = params
  const name = `AAH E2E Advanced ${randomUUID()}`
  const request = async (path: string, method = "GET", data?: unknown) => {
    let response
    try {
      response = await context.request.fetch(
        `${config.baseUrl.replace(/\/$/, "")}${path}`,
        {
          method,
          maxRedirects: 0,
          headers: {
            Authorization: `Bearer ${config.adminToken}`,
            "New-Api-User": config.userId,
          },
          data,
          timeout: 30_000,
        },
      )
    } catch {
      throw new Error(`New API advanced test ${method} request failed`)
    }
    if (!response.ok())
      throw new Error(`New API advanced test HTTP ${response.status()}`)
    const body = await response.json()
    if (body.success !== true)
      throw new Error(`New API advanced test ${method} rejected`)
    return body.data
  }
  const findOwned = async (): Promise<Snapshot[]> => {
    const data = await request(
      `/api/channel/search?keyword=${encodeURIComponent(name)}`,
    )
    const items = Array.isArray(data) ? data : data?.items
    if (!Array.isArray(items))
      throw new Error("Unexpected New API channel search shape")
    return items.filter((item: Snapshot) => item.name === name)
  }
  const ownedId = (channel: Snapshot) => {
    if (
      channel.name !== name ||
      !Number.isSafeInteger(channel.id) ||
      Number(channel.id) <= 0
    ) {
      throw new Error("Cannot identify run-owned New API channel")
    }
    return Number(channel.id)
  }
  const dialog = page.getByRole("dialog")
  const open = async () => {
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.MANAGED_SITE_CHANNELS}`,
    )
    await page
      .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.searchInput)
      .fill(name)
    await openManagedSiteChannelRowActions(page, name)
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    for (const name of [
      "Upstream model detection",
      "Routing",
      "Channel management",
      "Network settings",
    ])
      await dialog.getByRole("button", { name, exact: true }).click()
  }
  const save = async () => {
    await dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton).click()
    await expect(dialog).toBeHidden()
  }
  const toggle = (label: string) =>
    dialog.getByRole("switch", { name: label, exact: true })
  const textbox = (label: string) =>
    dialog.getByRole("textbox", { name: label, exact: true })
  const combo = (label: string) =>
    dialog.getByRole("combobox", { name: label, exact: true })

  await runScenarioWithCleanup({
    run: async () => {
      const status = await request("/api/status")
      const version = String(status?.version ?? "unknown")
      test.info().annotations.push({
        type: "new-api",
        description: `version=${/^[\w.+-]{1,80}$/.test(version) ? version : "unknown"}; channel type=1 (OpenAI); manually disabled`,
      })
      await request("/api/channel/", "POST", {
        mode: "single",
        channel: {
          name,
          type: 1,
          status: 2,
          key: `sk-e2e-${randomUUID()}`,
          base_url: "https://upstream.example.invalid/v1",
          models: "gpt-4o-mini",
          group: "default",
          priority: 0,
          weight: 0,
          auto_ban: 0,
          setting: JSON.stringify({
            force_format: true,
            thinking_to_content: true,
          }),
          settings: JSON.stringify({
            upstream_model_update_last_check_time: 100,
            upstream_model_update_last_detected_models: ["e2e-previous-model"],
          }),
          model_mapping: "{}",
          status_code_mapping: '{"418":"429"}',
        },
      })
      const channels = await findOwned()
      expect(channels.length).toBe(1)
      const id = ownedId(channels[0])
      const before: Snapshot = await request(`/api/channel/${id}`)
      expect(before.status === 2).toBe(true)
      expect(jsonObject(before.setting).force_format === true).toBe(true)
      expect(
        jsonObject(before.settings).upstream_model_update_last_check_time ===
          100,
      ).toBe(true)
      expect(jsonObject(before.status_code_mapping)["418"] === "429").toBe(true)

      await test.step("Save all nine advanced settings and verify real persistence", async () => {
        await open()
        await toggle("Check upstream model updates").check()
        await toggle("Automatically sync upstream models").check()
        await toggle("Automatically disable channel").check()
        await combo("Ignored upstream models").fill("e2e-ignored-model")
        await combo("Ignored upstream models").press("Enter")
        await combo("Test model").fill("e2e-test-model")
        await combo("Test model").press("Tab")
        await dialog
          .getByRole("button", { name: "Add mapping", exact: true })
          .click()
        await combo("Request model 1").fill("e2e-alias")
        await combo("Upstream model 1").fill("gpt-4o-mini")
        await textbox("Channel tag").fill("e2e-advanced")
        await textbox("Notes").fill("Real persistence verification")
        await textbox("Proxy address").fill("socks5h://127.0.0.1:1080")
        await save()
        const saved: Snapshot = await request(`/api/channel/${id}`)
        assertPreserved(before, saved)
        for (const [key, value] of Object.entries({
          test_model: "e2e-test-model",
          auto_ban: 1,
          tag: "e2e-advanced",
          remark: "Real persistence verification",
        })) {
          expect(saved[key] === value, `Persisted ${key}`).toBe(true)
        }
        expect(
          isDeepStrictEqual(jsonObject(saved.model_mapping), {
            "e2e-alias": "gpt-4o-mini",
          }),
        ).toBe(true)
        expect(
          jsonObject(saved.setting).proxy === "socks5h://127.0.0.1:1080",
        ).toBe(true)
        const settings = jsonObject(saved.settings)
        expect(settings.upstream_model_update_check_enabled === true).toBe(true)
        expect(settings.upstream_model_update_auto_sync_enabled === true).toBe(
          true,
        )
        expect(
          isDeepStrictEqual(settings.upstream_model_update_ignored_models, [
            "e2e-ignored-model",
          ]),
        ).toBe(true)
      })

      await test.step("Reopen, clear settings and verify false and empty values persist", async () => {
        await open()
        await expect(toggle("Automatically sync upstream models")).toBeChecked()
        await expect(combo("Test model")).toHaveValue("e2e-test-model")
        await expect(textbox("Channel tag")).toHaveValue("e2e-advanced")
        await expect(combo("Request model 1")).toHaveValue("e2e-alias")
        await toggle("Check upstream model updates").uncheck()
        await expect(
          toggle("Automatically sync upstream models"),
        ).not.toBeChecked()
        await expect(
          toggle("Automatically sync upstream models"),
        ).toBeDisabled()
        await toggle("Automatically disable channel").uncheck()
        await dialog
          .getByRole("group", { name: "Upstream model detection" })
          .getByRole("button", { name: "Cancel selection", exact: true })
          .click()
        await combo("Test model").fill("")
        await combo("Test model").press("Tab")
        await dialog.getByRole("button", { name: "Remove mapping 1" }).click()
        for (const label of ["Channel tag", "Notes", "Proxy address"])
          await textbox(label).fill("")
        await save()
        const cleared: Snapshot = await request(`/api/channel/${id}`)
        assertPreserved(before, cleared)
        for (const key of ["test_model", "tag", "remark"])
          expect(!cleared[key], `Cleared ${key}`).toBe(true)
        expect(cleared.auto_ban === 0).toBe(true)
        expect(Object.keys(jsonObject(cleared.model_mapping)).length).toBe(0)
        expect(!jsonObject(cleared.setting).proxy).toBe(true)
        const settings = jsonObject(cleared.settings)
        expect(!settings.upstream_model_update_check_enabled).toBe(true)
        expect(!settings.upstream_model_update_auto_sync_enabled).toBe(true)
        expect(
          isDeepStrictEqual(
            settings.upstream_model_update_ignored_models ?? [],
            [],
          ),
        ).toBe(true)
      })
    },
    finalizers: [
      async () => {
        await test.step("Delete the run-owned channel and confirm cleanup", async () => {
          for (const channel of await findOwned())
            await request(`/api/channel/${ownedId(channel)}`, "DELETE")
          expect(
            (await findOwned()).length,
            "Run-owned channel cleaned up",
          ).toBe(0)
        })
      },
    ],
    cleanupMessage: "New API advanced channel cleanup failed",
    failureMessage: "New API advanced channel real-site verification failed",
  })
}
