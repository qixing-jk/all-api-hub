import { SITE_TYPES } from "~/constants/siteType"
import { test } from "~~/e2e/fixtures/extensionTest"
import {
  INTERCEPTED_OCTOPUS_ORIGIN,
  openInterceptedAxonHubManagedSiteChannels,
  openInterceptedOctopusManagedSiteChannels,
} from "~~/e2e/fixtures/managedSiteChannelsIntercepted"
import { runManagedMultiKeyEditorScenario } from "~~/e2e/scenarios/managedMultiKeyEditor"

const keys = ["first-test-key", "second-test-key", "third-test-key"]

test("AxonHub multi-key changes persist without overwriting untouched keys", async ({
  context,
  page,
  extensionId,
}) => {
  const params = { context, page, extensionId }
  await openInterceptedAxonHubManagedSiteChannels({ ...params, apiKeys: keys })
  await runManagedMultiKeyEditorScenario({
    ...params,
    siteType: SITE_TYPES.AXON_HUB,
    baseUrl: "https://axonhub.example.invalid",
    name: "Example primary",
    keys,
  })
})

test("Octopus named multi-key changes preserve grants and native metadata", async ({
  context,
  page,
  extensionId,
}) => {
  const params = { context, page, extensionId }
  await openInterceptedOctopusManagedSiteChannels({
    ...params,
    nativeDetail: {
      id: 17,
      name: "Example outbound",
      dialect: "generic",
      enabled: false,
      base_url: "https://upstream.example.invalid",
      openai_chat_completion_path: "/v1/chat/completions",
      openai_response_path: "/v1/responses",
      anthropic_message_path: "/v1/messages",
      keys: keys.map((key, index) => ({
        name: `key-${index + 1}`,
        key,
        enabled: true,
        future: { preserved: true },
      })),
      models: ["model-a"],
      grants: keys.map((_, index) => ({
        model_name: "model-a",
        key_name: `key-${index + 1}`,
        protocols: 2,
        future: "preserved",
      })),
      proxy: false,
      custom_header: [],
      param_override: "",
      channel_proxy: "",
      match_regex: "",
    },
  })
  await runManagedMultiKeyEditorScenario({
    ...params,
    siteType: SITE_TYPES.OCTOPUS,
    baseUrl: INTERCEPTED_OCTOPUS_ORIGIN,
    name: "Example outbound",
    keys,
  })
})
