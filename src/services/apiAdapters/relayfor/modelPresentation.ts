import type { RelayForModelItem } from "~/services/apiService/relayfor/type"
import type { ModelPricing } from "~/services/modelList/pricingModel"
import type {
  ModelDisplayFact,
  ModelDisplayTranslationKey,
} from "~/services/models/modelDisplayFacts"

/** Keeps access conditions and extra meters visible alongside ordinary prices. */
export function relayForModelPresentation(
  item: RelayForModelItem,
  baseUrl: string,
): Pick<ModelPricing, "availability" | "providerGroup" | "presentation"> {
  const facts: ModelDisplayFact[] = []
  const label = (key: ModelDisplayTranslationKey, fallback: string) => ({
    translationKey: key,
    fallback,
  })
  const flags = [
    [
      "displayFacts.trainingConsent",
      "Training consent required",
      item.data_training_consent_required,
    ],
    [
      "displayFacts.trainingChannels",
      "Includes training channels",
      item.data_training_channel_available,
    ],
    [
      "displayFacts.promptAudit",
      "Prompt audit enabled",
      item.prompt_audit_enabled,
    ],
    [
      "displayFacts.auditConsent",
      "Audit consent required",
      item.prompt_audit_consent_required,
    ],
  ] as const
  for (const [key, fallback, value] of flags)
    if (value === true)
      facts.push({ type: "boolean", label: label(key, fallback), value })
  if (item.access_reason)
    facts.push({
      type: "text",
      label: label("displayFacts.accessReason", "Access condition"),
      value: item.access_reason,
    })
  if (item.subscription_plan)
    facts.push({
      type: "text",
      label: label("displayFacts.subscriptionPlan", "Subscription"),
      value: item.subscription_plan,
    })
  if (typeof item.subscription_multiplier === "number")
    facts.push({
      type: "number",
      label: label(
        "displayFacts.subscriptionMultiplier",
        "Subscription multiplier",
      ),
      value: item.subscription_multiplier,
    })
  for (const [key, fallback, amount] of [
    [
      "displayFacts.auditCharge",
      "Rejected-risk audit charge",
      item.prompt_audit_enabled ? item.prompt_audit_price : undefined,
    ],
    [
      "displayFacts.compactionCharge",
      "Remote compaction",
      item.remote_compaction_enabled
        ? item.effective_compaction_price
        : undefined,
    ],
  ] as const)
    if (typeof amount === "number" && Number.isFinite(amount))
      facts.push({
        type: "currency-price",
        label: label(key, fallback),
        amount,
        currency: "USD",
        unit: "request",
      })
  if (
    item.data_training_consent_required ||
    item.prompt_audit_consent_required ||
    item.accessible === false
  )
    facts.push({
      type: "link",
      label: label("displayFacts.consoleSettings", "Official settings"),
      text: label("displayFacts.consoleSettings", "Official settings"),
      href: new URL("/console/#models", baseUrl).href,
    })
  return {
    availability: {
      available:
        item.accessible !== false &&
        !item.data_training_consent_required &&
        !item.prompt_audit_consent_required,
      reason: item.access_reason,
    },
    ...(item.model_groups?.length
      ? {
          providerGroup: {
            selected: item.selected_group ?? "",
            locked: Boolean(item.active_session),
            options: item.model_groups.map((group) => ({
              value: group.name,
              available: group.available,
              multiplier: group.effective_multiplier,
            })),
          },
        }
      : {}),
    presentation: { summaryFacts: facts },
  }
}
