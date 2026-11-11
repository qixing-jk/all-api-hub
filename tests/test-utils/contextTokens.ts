import { createContextTokens } from "~/services/verification/modelQuality/contextTokens"

/** Load real packaged vocabularies before tests replace fetch for provider requests. */
export async function preloadContextTokens() {
  await createContextTokens({ state: "unmatched" })
  await createContextTokens({
    state: "resolved",
    match: "exact",
    metadata: { id: "openai/gpt-4", name: "GPT-4", provider_id: "openai" },
  })
}
