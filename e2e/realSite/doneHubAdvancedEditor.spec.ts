import { isDeepStrictEqual } from "node:util"

import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { DoneHubChannelType } from "~/constants/doneHub"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { openManagedSiteChannelRowActions } from "~~/e2e/scenarios/managedSiteChannels"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { resolveDoneHubManagedSiteConfig } from "~~/e2e/utils/realSite/managedSiteConfig"
import { runScenarioWithCleanup } from "~~/e2e/utils/scenarioErrors"

const managedSite = resolveDoneHubManagedSiteConfig()

test.use({ trace: "off", video: "off" })

test("DoneHub advanced settings persist and clear on a real server", async ({
  context,
  page,
  extensionId,
}) => {
  test.skip(
    !managedSite.config,
    "Missing DoneHub managed-site test credentials",
  )
  test.setTimeout(120_000)
  page.setDefaultTimeout(15_000)
  const config = managedSite.config!
  const name = `AAH E2E DoneHub Advanced ${crypto.randomUUID()}`
  const model = `aah-e2e-${crypto.randomUUID()}`
  let channelId: number | undefined

  // Only setup/read/cleanup use the native API; every tested edit uses the UI.
  // Do not print native payloads: even a test site can contain real credentials.
  const api = async (path: string, method = "GET", data?: unknown) => {
    const response = await fetch(
      `${config.baseUrl.replace(/\/$/u, "")}${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${config.adminToken}`,
          "New-Api-User": config.userId,
          "Content-Type": "application/json",
        },
        body: data === undefined ? undefined : JSON.stringify(data),
        signal: AbortSignal.timeout(20_000),
      },
    )
    if (!response.ok)
      throw new Error(`DoneHub ${method} failed: HTTP ${response.status}`)
    const body = await response.json()
    if (body.success !== true) throw new Error(`DoneHub ${method} was rejected`)
    return body.data
  }
  const findCreatedChannels = async () => {
    const result = await api(
      `/api/channel/?name=${encodeURIComponent(name)}&page=1&page_size=100`,
    )
    return (result.data as Array<{ id: number; name: string }>).filter(
      (channel) => channel.name === name,
    )
  }
  const read = async (): Promise<Record<string, unknown>> =>
    await api(`/api/channel/${channelId}`)
  const dialog = page.getByRole("dialog")
  const open = async () => {
    const url = new URL(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`,
    )
    url.searchParams.set("channelId", String(channelId))
    url.hash = MENU_ITEM_IDS.MANAGED_SITE_CHANNELS
    await page.goto(url.toString())
    await openManagedSiteChannelRowActions(page, name)
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    await expect(dialog).toBeVisible()
    for (const section of [
      "API compatibility",
      "Models",
      "Network & requests",
    ]) {
      const toggle = dialog.getByRole("button", { name: section, exact: true })
      if ((await toggle.getAttribute("aria-expanded")) !== "true")
        await toggle.click()
    }
  }
  const save = async () => {
    await page.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton).click()
    await expect(dialog).toBeHidden({ timeout: 30_000 })
  }
  const setJsonMap = async (label: string, json: string) => {
    const group = dialog.getByRole("group", { name: label, exact: true })
    await group.getByRole("button", { name: "Edit JSON", exact: true }).click()
    await group.getByRole("textbox", { name: label, exact: true }).fill(json)
  }
  const assertPreserved = (
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ) => {
    const edited = new Set([
      "compatible_response",
      "plugin",
      "model_mapping",
      "proxy",
      "test_model",
      "model_headers",
      "custom_parameter",
      "allow_extra_body",
      "disabled_stream",
      "updated_at",
    ])
    const changed = [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ].filter(
      (key) => !edited.has(key) && !isDeepStrictEqual(before[key], after[key]),
    )
    expect(changed, "Untouched native fields must survive both saves").toEqual(
      [],
    )
    const pluginWithoutResponses = (value: unknown) => {
      const plugin = structuredClone(value) as {
        customize?: Record<string, unknown>
      }
      if (plugin.customize) delete plugin.customize["16"]
      return plugin
    }
    expect(
      isDeepStrictEqual(
        pluginWithoutResponses(before.plugin),
        pluginWithoutResponses(after.plugin),
      ),
      "Other plugin settings must survive",
    ).toBe(true)
  }

  await runScenarioWithCleanup({
    run: async () => {
      await api("/api/channel/", "POST", {
        name,
        type: DoneHubChannelType.Custom,
        status: 2,
        key: "sk-aah-e2e-nonfunctional",
        base_url: "https://aah-e2e.example.invalid",
        models: model,
        group: "default",
        priority: 7,
        weight: 3,
        model_mapping: "{}",
        plugin: {
          customize: { "1": "/preserved/chat", "16": "/initial/responses" },
        },
      })
      const channels = await findCreatedChannels()
      expect(channels).toHaveLength(1)
      channelId = channels[0].id
      const before = await read()
      expect(before.status, "Temporary channel must stay disabled").toBe(2)
      await forceExtensionLanguage(page, "en")
      await stubLlmMetadataIndex(context)
      await seedUserPreferences(await getServiceWorker(context), {
        managedSiteType: SITE_TYPES.DONE_HUB,
        doneHub: config,
        openChangelogOnUpdate: false,
      })
      await open()
      await dialog
        .getByRole("switch", { name: "Responses API compatibility" })
        .check()
      await dialog
        .getByRole("textbox", { name: "Responses request path" })
        .fill("/smoke/responses")
      await setJsonMap(
        "Model mapping",
        JSON.stringify({ [model]: "upstream-smoke-model" }),
      )
      await setJsonMap("Custom request headers", '{"X-AAH-Smoke":"round-trip"}')
      await dialog
        .getByRole("textbox", { name: "Proxy URL", exact: true })
        .fill("http://127.0.0.1:9")
      await dialog
        .getByRole("combobox", { name: "Test model", exact: true })
        .fill("manual-smoke-model")
      await dialog
        .getByRole("combobox", { name: "Test model", exact: true })
        .press("Tab")
      await dialog
        .getByRole("textbox", { name: "Extra request parameters", exact: true })
        .fill('{"overwrite":true,"temperature":0.5}')
      await dialog
        .getByRole("switch", { name: "Forward extra body fields" })
        .check()
      const streamModels = dialog.getByRole("combobox", {
        name: "Models excluded from streaming",
        exact: true,
      })
      await streamModels.fill(model)
      await streamModels.press("Enter")
      await save()
      const saved = await read()
      expect(saved).toMatchObject({
        compatible_response: true,
        allow_extra_body: true,
        proxy: "http://127.0.0.1:9",
        test_model: "manual-smoke-model",
        disabled_stream: [model],
        plugin: { customize: { "16": "/smoke/responses" } },
      })
      expect(JSON.parse(String(saved.model_mapping))).toEqual({
        [model]: "upstream-smoke-model",
      })
      expect(JSON.parse(String(saved.model_headers))).toEqual({
        "X-AAH-Smoke": "round-trip",
      })
      expect(JSON.parse(String(saved.custom_parameter))).toEqual({
        overwrite: true,
        temperature: 0.5,
      })
      assertPreserved(before, saved)
      await open()
      await expect(
        dialog.getByRole("combobox", { name: "Test model", exact: true }),
      ).toHaveValue("manual-smoke-model")
      await expect(
        dialog.getByRole("textbox", { name: "Responses request path" }),
      ).toHaveValue("/smoke/responses")
      await expect(
        dialog.getByRole("switch", { name: "Responses API compatibility" }),
      ).toBeChecked()
      await dialog
        .getByRole("switch", { name: "Responses API compatibility" })
        .uncheck()
      await dialog
        .getByRole("switch", { name: "Forward extra body fields" })
        .uncheck()
      await dialog
        .getByRole("textbox", { name: "Responses request path" })
        .fill("")
      await dialog
        .getByRole("textbox", { name: "Proxy URL", exact: true })
        .fill("")
      await dialog
        .getByRole("combobox", { name: "Test model", exact: true })
        .fill("")
      await dialog
        .getByRole("textbox", { name: "Extra request parameters", exact: true })
        .fill("")
      await setJsonMap("Model mapping", "{}")
      await setJsonMap("Custom request headers", "{}")
      await streamModels.fill("")
      await streamModels.press("Backspace")
      await save()
      const cleared = await read()
      expect(cleared).toMatchObject({
        compatible_response: false,
        allow_extra_body: false,
        proxy: "",
        test_model: "",
        disabled_stream: [],
      })
      expect(JSON.parse(String(cleared.model_mapping))).toEqual({})
      expect(JSON.parse(String(cleared.model_headers))).toEqual({})
      expect(["", "{}", null]).toContain(cleared.custom_parameter)
      expect(
        (cleared.plugin as { customize: Record<string, unknown> }).customize[
          "16"
        ],
      ).toBe("")
      assertPreserved(saved, cleared)
      await open()
      await expect(
        dialog.getByRole("textbox", { name: "Proxy URL", exact: true }),
      ).toHaveValue("")
      await expect(
        dialog.getByRole("switch", { name: "Responses API compatibility" }),
      ).not.toBeChecked()
      await page.getByTestId(CHANNEL_DIALOG_TEST_IDS.cancelButton).click()
    },
    finalizers: [
      async () => {
        for (const channel of await findCreatedChannels())
          await api(`/api/channel/${channel.id}`, "DELETE")
        expect(
          await findCreatedChannels(),
          "Temporary channel cleanup must be confirmed",
        ).toEqual([])
      },
    ],
    cleanupMessage: "DoneHub advanced editor cleanup failed",
    failureMessage: "DoneHub advanced editor live smoke failed",
  })
})
