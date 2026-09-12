import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { ManagedResourceEditorBody } from "~/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody"
import { getManagedResourceFieldPolicy } from "~/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy"
import enChannelDialog from "~/locales/en/channelDialog.json"
import enCommon from "~/locales/en/common.json"
import enManagedSiteChannels from "~/locales/en/managedSiteChannels.json"
import enUi from "~/locales/en/ui.json"
import { cliProxyApiManagedResourceRegistration } from "~/services/apiAdapters/managedResources/cliProxyApi"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: async () => ({
      cliProxyApi: {
        baseUrl: "http://localhost:8317",
        adminToken: "management-test-key",
      },
    }),
  },
}))

const i18n = await createResourceTestI18n({
  en: {
    channelDialog: enChannelDialog,
    common: enCommon,
    managedSiteChannels: enManagedSiteChannels,
    ui: enUi,
  },
})
const t = i18n.getFixedT("en")

describe("CLIProxyAPI native editor presentation", () => {
  it.each(["openai-compatibility", "codex-api-key"])(
    "shows the correct credential scope and optional fields for %s",
    async (type) => {
      const user = userEvent.setup()
      const editor = await (
        await cliProxyApiManagedResourceRegistration.open()
      ).openCreateEditor()
      const policy = getManagedResourceFieldPolicy(
        SITE_TYPES.CLI_PROXY_API,
        "channel",
        "create",
      )!
      const onValueChange = vi.fn()
      render(
        <ManagedResourceEditorBody
          t={t}
          mode="create"
          descriptors={editor.fields}
          policy={policy}
          values={{
            ...editor.initialValues,
            type,
            supportedModels: "model=alias\n\nmodel-two",
            excluded_models: "excluded",
            headers: "X-Test: value",
            prefix: "route",
            credentials: {
              kind: "secret-list",
              entries: [
                {
                  id: "new",
                  secret: { kind: "replace", value: "key" },
                  fields: {},
                },
              ],
            },
          }}
          onValueChange={onValueChange}
        />,
      )
      if (type === "openai-compatibility") {
        expect(screen.getByRole("group", { name: "API Key 1" })).toBeVisible()
        expect(screen.getByLabelText(/Name/)).toBeVisible()
        await user.type(
          within(
            screen.getByRole("group", { name: "API Key 1" }),
          ).getByLabelText("API Key 1", { exact: true }),
          "x",
        )
        expect(onValueChange).toHaveBeenCalledWith(
          "credentials",
          expect.objectContaining({
            entries: [
              expect.objectContaining({
                secret: { kind: "replace", value: "keyx" },
              }),
            ],
          }),
        )
      } else {
        expect(
          screen.queryByRole("group", { name: "API Key 1" }),
        ).not.toBeInTheDocument()
        expect(screen.getByLabelText(/^API Key/)).toBeVisible()
        await user.type(screen.getByLabelText(/^API Key/), "x")
        expect(onValueChange).toHaveBeenCalledWith("key", {
          kind: "replace",
          value: "x",
        })
      }
      for (const section of ["Models", "Routing", "Advanced"]) {
        await user.click(
          screen.getByRole("button", { name: new RegExp(`^${section}`) }),
        )
      }
      const models = screen.getByRole("group", { name: "Available Models" })
      expect(within(models).getByLabelText("Original model 1")).toHaveValue(
        "model",
      )
      expect(within(models).getByLabelText("Alias (optional) 1")).toHaveValue(
        "alias",
      )
      const headers = screen.getByRole("group", { name: "Request headers" })
      expect(within(headers).getByLabelText("Header name 1")).toHaveValue(
        "X-Test",
      )
      await user.click(within(headers).getByRole("button", { name: "Add row" }))
      expect(within(headers).getByLabelText("Header name 2")).toHaveValue("")
      if (type === "openai-compatibility")
        expect(
          screen.queryByLabelText(/^Excluded models/),
        ).not.toBeInTheDocument()
      else expect(screen.getByLabelText(/^Excluded models/)).toBeVisible()
    },
  )
})
