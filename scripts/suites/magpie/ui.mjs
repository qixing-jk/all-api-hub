import { randomUUID } from "node:crypto"
import { expect } from "@playwright/test"

import { runScenarioWithCleanup } from "../../../e2e/utils/scenarioErrors.ts"
import { runMagpieKeyPoolScenario } from "./keyPool.mjs"
import { createMagpieRunResources } from "./native.mjs"
import { patchMagpieBrowserState, restoreMagpieBrowserState } from "./state.mjs"
import { MAGPIE_TEST_MODELS } from "./upstream.mjs"

const wait = { timeout: 35_000 }

/** Shared by the maintained CDP runner and fresh-profile real-site tests. */
export async function runMagpieUiScenario({
  page,
  extensionId,
  native,
  config,
  upstream,
  scenario,
  onCheck = () => {},
  onCapture,
}) {
  const resources = await createMagpieRunResources(native)
  const runName = `AAH Magpie E2E ${randomUUID()}`
  const credentialNames = new Set()
  const credentialIds = new Set()
  const invalidKey = `invalid-${randomUUID()}`
  const origin = `chrome-extension://${extensionId}/options.html`
  const context = page.context()
  const originalCookies = await context.cookies(config.baseUrl)
  let authenticatedCookies = []
  let snapshot
  let originalLanguage
  const checks = []
  const checked = (name) => {
    checks.push(name)
    onCheck(name)
  }
  const dialog = page.getByRole("dialog")
  const selectModel = async (model) => {
    const group = dialog.getByRole("group", {
      name: "Available Models",
      exact: true,
    })
    const clear = group.getByRole("button", {
      name: "Cancel selection",
      exact: true,
    })
    if (await clear.isEnabled()) await clear.click()
    const input = group.getByRole("combobox", {
      name: "Available Models",
      exact: true,
    })
    await input.fill(model)
    await input.press("Enter")
    await input.press("Tab")
  }
  const projectionBase = `https://${randomUUID()}.example.invalid`
  const row = (name) =>
    page.getByRole("row").filter({ has: page.getByText(name, { exact: true }) })
  const action = async (name, label) => {
    await page.getByTestId("managed-site-channels-search-input").fill(name)
    await row(name)
      .getByRole("button", { name: "Actions", exact: true })
      .click()
    await page.getByRole("menuitem", { name: label, exact: true }).click()
  }
  const edit = async (name) => {
    await action(name, "Edit")
    await expect(dialog.locator("#channel-name")).toHaveValue(name, wait)
  }
  const save = async () => {
    await dialog
      .getByRole("button", { name: "Save Changes", exact: true })
      .click()
    await expect(dialog).toBeHidden(wait)
  }
  const find = async (id) => (await native.inventory()).find((p) => p.id === id)
  const readCreated = async (name) => {
    await expect
      .poll(
        async () =>
          (await native.inventory()).filter((p) => p.name === name).length,
        wait,
      )
      .toBe(1)
    const provider = (await native.inventory()).find((p) => p.name === name)
    resources.ids.add(provider.id)
    return provider
  }

  return runScenarioWithCleanup({
    run: async () => {
      await page.setViewportSize({ width: 1440, height: 1050 })
      await page.goto(origin)
      await expect(page.locator("[data-options-page-content]")).toBeVisible(
        wait,
      )
      originalLanguage = await page.evaluate(() =>
        localStorage.getItem("all-api-hub-i18nextLng"),
      )
      await page.evaluate(() =>
        localStorage.setItem("all-api-hub-i18nextLng", "en"),
      )
      snapshot = await page.evaluate(patchMagpieBrowserState, config)
      await page.addLocatorHandler(
        page.getByRole("dialog").filter({ has: page.locator("iframe") }),
        () => page.keyboard.press("Escape"),
      )
      // A full document navigation reloads preference/locale state and cannot
      // race the initial empty-hash redirect to Overview in a fresh profile.
      await page.goto(`${origin}?tab=managedSite#basic`)
      await expect(page.locator("#magpie-base-url input")).toHaveValue(
        config.baseUrl,
        wait,
      )
      await page.locator("#magpie-web-key input").fill(config.webKey)
      await page
        .getByRole("button", { name: "Check connection", exact: true })
        .click()
      await expect(
        page.getByText("Connection verified", { exact: true }),
      ).toBeVisible(wait)
      authenticatedCookies = await context.cookies(config.baseUrl)
      if (scenario === "management") {
        await page.locator("#magpie-web-key input").fill(invalidKey)
        await page
          .getByRole("button", { name: "Check connection", exact: true })
          .click()
        await expect(page.getByText(/The Web key was rejected/)).toBeVisible(
          wait,
        )
        await page.locator("#magpie-web-key input").fill(config.webKey)
        await page
          .getByRole("button", { name: "Check connection", exact: true })
          .click()
        await expect(
          page.getByText("Connection verified", { exact: true }),
        ).toBeVisible(wait)
        authenticatedCookies = await context.cookies(config.baseUrl)
        checked(
          "Web key authentication, rejection with existing Cookie, recovery",
        )
      }
      if (scenario === "key-pool") {
        await runMagpieKeyPoolScenario({
          page,
          dialog,
          origin,
          native,
          resources,
          runName,
          workspace: { edit, save, find, readCreated },
          onCheck: checked,
          onCapture,
        })
      } else if (scenario === "management") {
        const name = `${runName} provider`
        const renamed = `${runName} renamed`
        resources.names.add(name)
        resources.names.add(renamed)
        await page.goto(`${origin}#managedSiteChannels`)
        await page
          .getByRole("button", { name: "Add channel", exact: true })
          .click()
        await dialog.locator("#channel-name").fill(name)
        const endpoints = {
          chat: `${projectionBase}/proxy/v1`,
          responses: `${projectionBase}/responses/v1`,
          anthropic: `${projectionBase}/anthropic`,
          gemini: `${projectionBase}/gemini/v1beta`,
        }
        for (const [type, label, value] of [
          ["OpenAI", "Chat Completions URL", endpoints.chat],
          ["Responses", "Responses URL", endpoints.responses],
          ["Anthropic", "Anthropic URL", endpoints.anthropic],
          ["Gemini", "Gemini URL", endpoints.gemini],
        ]) {
          await dialog.getByRole("radio", { name: type, exact: true }).check()
          await dialog.getByLabel(label, { exact: true }).fill(value)
        }
        const key = `sk-nonfunctional-${randomUUID()}`
        await dialog.locator("#channel-key").fill(key)
        await selectModel(MAGPIE_TEST_MODELS[0])
        await dialog
          .getByRole("button", { name: "Advanced", exact: true })
          .click()
        const headers = dialog.getByRole("group", {
          name: "Custom headers",
          exact: true,
        })
        await headers
          .getByRole("button", { name: "Add row", exact: true })
          .click()
        await headers
          .getByRole("textbox", {
            name: "Custom headers: row 1 key",
            exact: true,
          })
          .fill("X-AAH-E2E")
        await headers
          .getByRole("textbox", {
            name: "Custom headers: row 1 value",
            exact: true,
          })
          .fill("original")
        await expect(
          headers.getByRole("textbox", {
            name: "Custom headers: row 1 value",
            exact: true,
          }),
        ).toHaveValue("original")
        const settings = {
          modelsURL: `${projectionBase}/catalog/models`,
          catalog: "openai, anthropic",
          balanceURL: `${projectionBase}/balance?key={key}`,
          balancePath: "data.balance / 500000",
          maxConcurrency: 3,
          maxRPM: 60,
          priceRate: 0.8,
        }
        const settingLabels = {
          modelsURL: "Models URL",
          catalog: "Model catalog",
          balanceURL: "Balance URL",
          balancePath: "Balance expression",
          maxConcurrency: "Concurrent requests per key",
          maxRPM: "Requests per minute per key",
          priceRate: "Price multiplier",
        }
        for (const [field, value] of Object.entries(settings))
          await dialog
            .getByLabel(settingLabels[field], { exact: true })
            .fill(String(value))
        await onCapture?.("provider-editor", dialog)
        await dialog
          .getByRole("button", { name: "Create Channel", exact: true })
          .click()
        await expect(dialog).toBeHidden(wait)
        const created = await readCreated(name)
        expect(created.baseAPI).toBe("gemini")
        for (const [field, value] of Object.entries(endpoints))
          expect(created[field]).toBe(value)
        expect(created.chosen).toEqual([MAGPIE_TEST_MODELS[0]])
        expect(created.headers).toEqual({ "X-AAH-E2E": "original" })
        expect(created).toMatchObject(settings)
        checked(
          "UI create and native readback of four independent protocol URLs",
        )
        const search = page.getByTestId("managed-site-channels-search-input")
        for (const query of [
          created.id,
          name.toUpperCase(),
          MAGPIE_TEST_MODELS[0],
          ...Object.values(endpoints),
        ]) {
          await search.fill(query)
          await expect(row(name)).toBeVisible(wait)
        }
        await search.fill(`missing-${randomUUID()}`)
        await expect(row(name)).toBeHidden(wait)
        const ref = {
          siteType: "magpie",
          kind: "channel",
          scopeKey: config.baseUrl.replace(/\/+$/, ""),
          resourceId: created.id,
        }
        const query = new URLSearchParams({
          resourceRef: JSON.stringify(ref),
          search: "unrelated previous query",
        })
        await page.goto(`${origin}?${query}#managedSiteChannels`)
        await expect(row(name)).toBeVisible(wait)
        await expect(search).toHaveValue(created.id)
        await expect(
          page.getByRole("row").filter({
            has: page.getByRole("button", { name: "Actions", exact: true }),
          }),
        ).toHaveCount(1)
        checked(
          "Channel search by ID, name, model and all protocol URLs; exact resource deep link overrides stale search",
        )
        await edit(name)
        await expect(
          dialog.getByRole("radio", { name: "Gemini", exact: true }),
        ).toBeChecked()
        await expect(
          dialog.getByLabel("Chat Completions URL", { exact: true }),
        ).toHaveCount(0)
        await expect(
          dialog.getByLabel("Gemini URL", { exact: true }),
        ).toHaveValue(endpoints.gemini)
        await dialog
          .getByRole("radio", { name: "Responses", exact: true })
          .check()
        await expect(
          dialog.getByLabel("Responses URL", { exact: true }),
        ).toHaveValue(endpoints.responses)
        await dialog.getByRole("radio", { name: "Gemini", exact: true }).check()
        await dialog.getByRole("radio", { name: "Gemini", exact: true }).focus()
        await page.keyboard.press("ArrowLeft")
        await expect(
          dialog.getByRole("radio", { name: "Anthropic", exact: true }),
        ).toBeChecked()
        await page.keyboard.press("ArrowRight")
        await expect(
          dialog.getByRole("radio", { name: "Gemini", exact: true }),
        ).toBeChecked()
        checked(
          "API type selection reopens correctly and preserves each independent address",
        )
        await dialog
          .getByRole("button", { name: "Advanced", exact: true })
          .click()
        for (const [field, value] of Object.entries(settings))
          await expect(
            dialog.getByLabel(settingLabels[field], { exact: true }),
          ).toHaveValue(typeof value === "number" ? String(value) : value)
        await dialog
          .getByRole("button", { name: "View saved API key", exact: true })
          .click()
        await expect
          .poll(
            async () =>
              (await dialog.locator("#channel-key").inputValue()) === key,
            wait,
          )
          .toBe(true)
        // Independently edit the backend after the UI has captured its snapshot.
        await native.save({
          id: created.id,
          name,
          ...endpoints,
          ...settings,
          models: created.chosen,
          headers: { "X-AAH-E2E": "concurrent" },
          fallback: [],
          routing: "rotate",
          affinity: "session",
          sink: true,
          queueLimit: 12,
          queueWait: 25,
          contexts: { [MAGPIE_TEST_MODELS[0]]: 128000 },
          unlisted: true,
          searches: true,
        })
        const concurrent = await find(created.id)
        await dialog.locator("#channel-name").fill(renamed)
        await dialog
          .getByRole("radio", { name: "Responses", exact: true })
          .check()
        await save()
        const edited = await find(created.id)
        expect(edited.name).toBe(renamed)
        expect(edited.baseAPI).toBe("responses")
        expect(edited.headers).toEqual({ "X-AAH-E2E": "concurrent" })
        expect(edited).toMatchObject(settings)
        for (const field of [
          "routing",
          "affinity",
          "sink",
          "queueLimit",
          "queueWait",
          "contexts",
          "unlisted",
          "searches",
        ])
          expect(edited[field]).toEqual(concurrent[field])
        for (const [field, value] of Object.entries(endpoints))
          expect(edited[field]).toBe(value)
        checked(
          "Common settings create/reopen and preservation of concurrent headers, routing, queue and model settings",
        )
        await edit(renamed)
        await expect(
          dialog.getByRole("radio", { name: "Responses", exact: true }),
        ).toBeChecked()
        await dialog
          .getByRole("button", { name: "Advanced", exact: true })
          .click()
        for (const field of Object.keys(settings))
          await dialog
            .getByLabel(settingLabels[field], { exact: true })
            .fill("")
        await save()
        const reset = await find(created.id)
        for (const field of [
          "modelsURL",
          "catalog",
          "balanceURL",
          "balancePath",
        ])
          expect(reset[field] ?? "").toBe("")
        expect(reset.maxConcurrency).toBeNull()
        expect(reset.maxRPM ?? 0).toBe(0)
        expect(reset.priceRate ?? 0).toBe(0)
        for (const field of [
          "routing",
          "affinity",
          "sink",
          "queueLimit",
          "queueWait",
          "contexts",
          "unlisted",
          "searches",
        ])
          expect(reset[field]).toEqual(concurrent[field])
        checked("Explicit settings reset preserves unsupported native fields")
        await edit(renamed)
        const replacement = `sk-replaced-${randomUUID()}`
        await dialog.locator("#channel-key").fill(replacement)
        await save()
        expect(
          (await native.key(created.id)) === replacement,
          "Replacement key persisted",
        ).toBe(true)
        for (const [label, off] of [
          ["Disabled", true],
          ["Enabled", false],
        ]) {
          await edit(renamed)
          await dialog.locator("#channel-status").click()
          await page.getByRole("option", { name: label, exact: true }).click()
          await save()
          expect((await find(created.id)).off).toBe(off)
        }
        checked("Primary key replacement and disable/enable")
        await action(renamed, "Delete")
        await dialog
          .getByRole("button", { name: "Delete", exact: true })
          .click()
        await expect
          .poll(async () => !!(await find(created.id)), wait)
          .toBe(false)
        checked("UI delete confirmed by native inventory")
      } else {
        const syncModels = scenario === "model-sync"
        if (syncModels && !upstream)
          throw new Error("Model sync requires shared inference credentials")
        const protocols = [
          ["OpenAI-compatible", "chat", "/v1"],
          ["OpenAI", "responses", "/v1"],
          ["Anthropic", "anthropic", ""],
          ["Google/Gemini", "gemini", "/v1beta"],
        ]
        for (const [label, field, suffix] of syncModels
          ? protocols.slice(0, 1)
          : protocols) {
          const credentialName = `${runName} ${field}`
          const key = syncModels ? upstream.apiKey : `sk-import-${randomUUID()}`
          credentialNames.add(credentialName)
          await page.goto(`${origin}#apiCredentialProfiles`)
          await page.getByTestId("api-credential-profiles-add-button").click()
          const credentialDialog = page.getByTestId(
            "api-credential-profile-dialog",
          )
          await credentialDialog
            .locator("#api-credential-profile-name")
            .fill(credentialName)
          // Only the API-type selector has this current value in a new form.
          await credentialDialog
            .getByRole("combobox")
            .filter({ hasText: "OpenAI-compatible" })
            .click()
          await page.getByRole("option", { name: label, exact: true }).click()
          const sourceUrl = syncModels
            ? upstream.baseUrl
            : `${projectionBase}/proxy-${field}${suffix}`
          await credentialDialog
            .locator("#api-credential-profile-baseUrl")
            .fill(sourceUrl)
          await credentialDialog
            .locator("#api-credential-profile-apiKey")
            .fill(key)
          await credentialDialog
            .getByTestId("api-credential-profile-dialog-save-button")
            .click()
          await expect(credentialDialog).toBeHidden(wait)
          const profileRow = page
            .getByTestId(/^api-credential-profile-row-/)
            .filter({ hasText: credentialName })
          const rowId = await profileRow.getAttribute("data-testid")
          credentialIds.add(rowId.slice("api-credential-profile-row-".length))
          const logo = profileRow.getByRole("img", {
            name: "MAGPIE logo",
            exact: true,
          })
          await expect(logo).toBeVisible(wait)
          await expect
            .poll(() =>
              logo.evaluate(
                (image) => image.complete && image.naturalWidth > 0,
              ),
            )
            .toBe(true)
          await profileRow
            .getByTestId("api-credential-profile-import-to-managed-site-button")
            .click()
          const duplicate = page.getByRole("dialog", {
            name: "Channel already exists",
            exact: true,
          })
          await expect(
            dialog.locator("#channel-name").or(duplicate),
          ).toBeVisible(wait)
          if (await duplicate.isVisible())
            await duplicate
              .getByRole("button", { name: "Continue", exact: true })
              .click()
          const importedName = await dialog
            .locator("#channel-name")
            .inputValue()
          resources.names.add(importedName)
          const apiType = {
            chat: "OpenAI",
            responses: "Responses",
            anthropic: "Anthropic",
            gemini: "Gemini",
          }[field]
          await expect(
            dialog.getByRole("radio", { name: apiType, exact: true }),
          ).toBeChecked()
          await selectModel(MAGPIE_TEST_MODELS[0])
          await dialog
            .getByRole("button", { name: "Create Channel", exact: true })
            .click()
          await expect(dialog).toBeHidden(wait)
          const imported = await readCreated(importedName)
          expect(imported.chosen).toEqual([MAGPIE_TEST_MODELS[0]])
          expect(imported[field]).toBe(sourceUrl)
          for (const other of [
            "chat",
            "responses",
            "anthropic",
            "gemini",
          ].filter((p) => p !== field))
            expect(imported[other] ?? "").toBe("")
          expect(
            (await native.key(imported.id)) === key,
            "Imported credential persisted",
          ).toBe(true)
          if (field === "gemini") {
            // The same Gemini mount may be stored with or without /v1beta.
            // Duplicate lookup must survive the shared matcher's URL checks.
            await native.save({
              id: imported.id,
              name: importedName,
              chat: "",
              responses: "",
              anthropic: "",
              gemini: sourceUrl.replace(/\/v1beta$/, ""),
              models: imported.chosen,
            })
          }
          await profileRow
            .getByTestId("api-credential-profile-import-to-managed-site-button")
            .click()
          await expect(
            page.getByRole("heading", {
              name: "Channel already exists",
              exact: true,
            }),
          ).toBeVisible(wait)
          await dialog
            .getByRole("button", { name: "Cancel", exact: true })
            .click()
          expect(
            (await native.inventory())
              .filter((p) => p.name === importedName)
              .map((p) => p.id),
          ).toEqual([imported.id])
          checked(
            `${label} ${syncModels ? "real" : "projection"} credential import, URL preservation and duplicate cancellation`,
          )
          await profileRow
            .getByTestId("api-credential-profile-delete-trigger-button")
            .click()
          await page
            .getByTestId("api-credential-profile-delete-confirm-button")
            .click()
          await expect(profileRow).toBeHidden(wait)
          if (syncModels) {
            await page.goto(`${origin}#managedSiteChannels`)
            await edit(importedName)
            const beforeDiscovery = (await find(imported.id)).chosen
            const selectedModels = dialog.locator('[data-slot="combobox-chip"]')
            await expect(selectedModels).toHaveText(beforeDiscovery)
            await dialog
              .getByRole("button", {
                name: "Load Available Models",
                exact: true,
              })
              .click()
            await expect(
              dialog.getByRole("button", {
                name: "Refresh Available Models",
                exact: true,
              }),
            ).toBeVisible({ timeout: 60_000 })
            expect((await find(imported.id)).chosen).toEqual(beforeDiscovery)
            await expect(selectedModels).toHaveText(beforeDiscovery)
            await onCapture?.("model-discovery", dialog)
            await dialog
              .getByRole("button", { name: "Cancel", exact: true })
              .click()
            checked(
              "Editor model discovery preserves the saved selection and supports cancellation",
            )
            // Observe the real backend discovery response and compare it with
            // independent native readback; real catalogs need no fixed model IDs.
            const [response] = await Promise.all([
              context.waitForEvent("response", {
                timeout: 60_000,
                predicate: (response) =>
                  response.request().method() === "POST" &&
                  new URL(response.url()).pathname.endsWith(
                    "/api/provider/list",
                  ) &&
                  response.request().postDataJSON()?.id === imported.id,
              }),
              action(importedName, "Sync model list immediately"),
            ])
            expect(response.ok(), "Backend model discovery succeeded").toBe(
              true,
            )
            const body = await response.json()
            expect(
              Array.isArray(body.models),
              "Backend returned a model list",
            ).toBe(true)
            const models = [...new Set(body.models.map((m) => m.id))].sort()
            expect(
              models.length,
              "Shared upstream must expose at least one model for sync",
            ).toBeGreaterThan(0)
            await expect
              .poll(
                async () =>
                  [...((await find(imported.id)).chosen ?? [])].sort(),
                wait,
              )
              .toEqual(models)
            checked(
              "Background model sync persisted the real discovered catalog",
            )
          }
          await native.remove(imported.id)
        }
      }
      return checks
    },
    finalizers: [
      () => resources.cleanup(),
      async () => {
        if (snapshot)
          await page.evaluate(restoreMagpieBrowserState, {
            snapshot,
            config,
            invalidKey,
            credentialNames: [...credentialNames],
            credentialIds: [...credentialIds],
            resourceIds: [...resources.ids],
          })
      },
      async () => {
        const current = await context.cookies(config.baseUrl)
        for (const cookie of authenticatedCookies.filter((c) =>
          c.name.startsWith("magpie_web_"),
        )) {
          if (
            !current.some(
              (c) =>
                c.name === cookie.name &&
                c.domain === cookie.domain &&
                c.path === cookie.path &&
                c.value === cookie.value,
            )
          )
            continue
          await context.clearCookies({
            name: cookie.name,
            domain: cookie.domain,
            path: cookie.path,
          })
          const original = originalCookies.find(
            (c) =>
              c.name === cookie.name &&
              c.domain === cookie.domain &&
              c.path === cookie.path,
          )
          if (original) await context.addCookies([original])
        }
      },
      async () => {
        if (originalLanguage !== undefined)
          await page.evaluate((value) => {
            if (localStorage.getItem("all-api-hub-i18nextLng") === "en") {
              if (value === null)
                localStorage.removeItem("all-api-hub-i18nextLng")
              else localStorage.setItem("all-api-hub-i18nextLng", value)
            }
          }, originalLanguage)
      },
    ],
    cleanupMessage: "Magpie live scenario cleanup failed",
    failureMessage: `Magpie ${scenario} scenario failed`,
  })
}
