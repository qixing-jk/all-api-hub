import type { TFunction } from "i18next"

import type { NativeKeyManagementRow } from "~/features/KeyManagement/types"
import type {
  AccountKeyResourceFacts,
  ResourceDisplayFact,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/keyManagement"
import {
  OPENROUTER_KEY_FIELD_IDS,
  OPENROUTER_KEY_LIMIT_MODES,
  OPENROUTER_KEY_LIMIT_RESETS,
} from "~/services/apiAdapters/openrouter/keyResourceFields"

import type {
  KeyResourceCardPresentation,
  KeyResourceFact,
} from "./keyResourceCard"

const detailFieldIds = new Set<string>([
  OPENROUTER_KEY_FIELD_IDS.Workspace,
  OPENROUTER_KEY_FIELD_IDS.Creator,
  OPENROUTER_KEY_FIELD_IDS.LimitMode,
  OPENROUTER_KEY_FIELD_IDS.Limit,
  OPENROUTER_KEY_FIELD_IDS.LimitRemaining,
  OPENROUTER_KEY_FIELD_IDS.LimitReset,
  OPENROUTER_KEY_FIELD_IDS.Usage,
  OPENROUTER_KEY_FIELD_IDS.UsageDaily,
  OPENROUTER_KEY_FIELD_IDS.UsageWeekly,
  OPENROUTER_KEY_FIELD_IDS.UsageMonthly,
  OPENROUTER_KEY_FIELD_IDS.ByokUsage,
  OPENROUTER_KEY_FIELD_IDS.ByokUsageDaily,
  OPENROUTER_KEY_FIELD_IDS.ByokUsageWeekly,
  OPENROUTER_KEY_FIELD_IDS.ByokUsageMonthly,
  OPENROUTER_KEY_FIELD_IDS.IncludeByokInLimit,
  OPENROUTER_KEY_FIELD_IDS.Disabled,
  OPENROUTER_KEY_FIELD_IDS.CreatedAt,
  OPENROUTER_KEY_FIELD_IDS.UpdatedAt,
  OPENROUTER_KEY_FIELD_IDS.ExpiresAt,
])

// OpenRouter defines Management Key limits and usage amounts in USD:
// https://openrouter.ai/docs/api/api-reference/api-keys/list-api-keys
const usdAmountFieldIds = new Set<string>([
  OPENROUTER_KEY_FIELD_IDS.Limit,
  OPENROUTER_KEY_FIELD_IDS.LimitRemaining,
  OPENROUTER_KEY_FIELD_IDS.Usage,
  OPENROUTER_KEY_FIELD_IDS.UsageDaily,
  OPENROUTER_KEY_FIELD_IDS.UsageWeekly,
  OPENROUTER_KEY_FIELD_IDS.UsageMonthly,
  OPENROUTER_KEY_FIELD_IDS.ByokUsage,
  OPENROUTER_KEY_FIELD_IDS.ByokUsageDaily,
  OPENROUTER_KEY_FIELD_IDS.ByokUsageWeekly,
  OPENROUTER_KEY_FIELD_IDS.ByokUsageMonthly,
])

const usdAmountFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  currencyDisplay: "code",
  minimumFractionDigits: 0,
  maximumFractionDigits: 8,
})

const formatUsdAmount = (value: number): string =>
  usdAmountFormatter.format(value)

const findFact = (facts: AccountKeyResourceFacts, fieldId: string) =>
  facts.fields.find((fact) => fact.fieldId === fieldId)

const primitiveFactValue = (
  facts: AccountKeyResourceFacts,
  fieldId: string,
) => {
  const fact = findFact(facts, fieldId)
  return fact && (fact.kind === "number" || fact.kind === "text")
    ? String(fact.value)
    : undefined
}

const usdFactValue = (
  facts: AccountKeyResourceFacts,
  fieldId: string,
): string | undefined => {
  const fact = findFact(facts, fieldId)
  return fact?.kind === "number" ? formatUsdAmount(fact.value) : undefined
}

const fieldLabel = (fieldId: string, t: TFunction) => {
  switch (fieldId) {
    case OPENROUTER_KEY_FIELD_IDS.Workspace:
      return t("keyManagement:openRouter.list.details.workspace")
    case OPENROUTER_KEY_FIELD_IDS.Creator:
      return t("keyManagement:openRouter.list.details.creator")
    case OPENROUTER_KEY_FIELD_IDS.LimitMode:
      return t("keyManagement:openRouter.list.details.limitMode")
    case OPENROUTER_KEY_FIELD_IDS.Limit:
      return t("keyManagement:openRouter.list.details.limit")
    case OPENROUTER_KEY_FIELD_IDS.LimitRemaining:
      return t("keyManagement:openRouter.list.details.remaining")
    case OPENROUTER_KEY_FIELD_IDS.LimitReset:
      return t("keyManagement:openRouter.list.details.reset")
    case OPENROUTER_KEY_FIELD_IDS.Usage:
      return t("keyManagement:openRouter.list.details.usage")
    case OPENROUTER_KEY_FIELD_IDS.UsageDaily:
      return t("keyManagement:openRouter.list.details.usageDaily")
    case OPENROUTER_KEY_FIELD_IDS.UsageWeekly:
      return t("keyManagement:openRouter.list.details.usageWeekly")
    case OPENROUTER_KEY_FIELD_IDS.UsageMonthly:
      return t("keyManagement:openRouter.list.details.usageMonthly")
    case OPENROUTER_KEY_FIELD_IDS.ByokUsage:
      return t("keyManagement:openRouter.list.details.byokUsage")
    case OPENROUTER_KEY_FIELD_IDS.ByokUsageDaily:
      return t("keyManagement:openRouter.list.details.byokUsageDaily")
    case OPENROUTER_KEY_FIELD_IDS.ByokUsageWeekly:
      return t("keyManagement:openRouter.list.details.byokUsageWeekly")
    case OPENROUTER_KEY_FIELD_IDS.ByokUsageMonthly:
      return t("keyManagement:openRouter.list.details.byokUsageMonthly")
    case OPENROUTER_KEY_FIELD_IDS.IncludeByokInLimit:
      return t("keyManagement:openRouter.list.details.includeByokInLimit")
    case OPENROUTER_KEY_FIELD_IDS.Disabled:
      return t("keyManagement:openRouter.list.details.disabled")
    case OPENROUTER_KEY_FIELD_IDS.CreatedAt:
      return t("keyManagement:openRouter.list.details.createdAt")
    case OPENROUTER_KEY_FIELD_IDS.UpdatedAt:
      return t("keyManagement:openRouter.list.details.updatedAt")
    case OPENROUTER_KEY_FIELD_IDS.ExpiresAt:
      return t("keyManagement:openRouter.list.details.expiresAt")
    default:
      return t("keyManagement:openRouter.list.values.missing")
  }
}

const displayFactValue = (fact: ResourceDisplayFact, t: TFunction) => {
  switch (fact.kind) {
    case "boolean":
      return fact.value
        ? t("keyManagement:openRouter.list.values.yes")
        : t("keyManagement:openRouter.list.values.no")
    case "text":
      if (fact.fieldId === OPENROUTER_KEY_FIELD_IDS.LimitMode) {
        return fact.value === OPENROUTER_KEY_LIMIT_MODES.Unlimited
          ? t("keyManagement:openRouter.editor.options.limitMode.unlimited")
          : fact.value === OPENROUTER_KEY_LIMIT_MODES.Limited
            ? t("keyManagement:openRouter.editor.options.limitMode.limited")
            : t("keyManagement:openRouter.list.values.missing")
      }
      if (fact.fieldId === OPENROUTER_KEY_FIELD_IDS.LimitReset) {
        switch (fact.value) {
          case OPENROUTER_KEY_LIMIT_RESETS.Daily:
            return t("keyManagement:openRouter.editor.options.limitReset.daily")
          case OPENROUTER_KEY_LIMIT_RESETS.Weekly:
            return t(
              "keyManagement:openRouter.editor.options.limitReset.weekly",
            )
          case OPENROUTER_KEY_LIMIT_RESETS.Monthly:
            return t(
              "keyManagement:openRouter.editor.options.limitReset.monthly",
            )
          case OPENROUTER_KEY_LIMIT_RESETS.None:
            return t("keyManagement:openRouter.editor.options.limitReset.none")
          default:
            return t("keyManagement:openRouter.list.values.missing")
        }
      }
      return fact.value
    case "list":
      return fact.value.join(", ")
    case "secret":
      return "••••"
    case "number":
      return usdAmountFieldIds.has(fact.fieldId)
        ? formatUsdAmount(fact.value)
        : String(fact.value)
  }
}

const statusPresentation = (
  status: AccountKeyResourceFacts["status"],
  t: TFunction,
): Pick<KeyResourceCardPresentation, "status" | "statusLabel"> => {
  switch (status) {
    case "enabled":
      return {
        status: "active",
        statusLabel: t("keyManagement:openRouter.list.status.enabled"),
      }
    case "disabled":
      return {
        status: "inactive",
        statusLabel: t("keyManagement:openRouter.list.status.disabled"),
      }
    case "expired":
      return {
        status: "inactive",
        statusLabel: t("keyManagement:openRouter.list.status.expired"),
      }
    default:
      return {
        status: "unknown",
        statusLabel: t("keyManagement:openRouter.list.status.unknown"),
      }
  }
}

export const buildOpenRouterKeyResourceDetailFacts = (
  facts: AccountKeyResourceFacts,
  t: TFunction,
): KeyResourceFact[] =>
  facts.fields
    .filter((fact) => detailFieldIds.has(fact.fieldId))
    .map((fact) => ({
      id: fact.fieldId,
      label: fieldLabel(fact.fieldId, t),
      value: displayFactValue(fact, t),
    }))

export const buildOpenRouterKeyResourceCardPresentation = (
  row: NativeKeyManagementRow,
  t: TFunction,
): KeyResourceCardPresentation => {
  const limitMode = primitiveFactValue(
    row.facts,
    OPENROUTER_KEY_FIELD_IDS.LimitMode,
  )
  const unlimited = limitMode === OPENROUTER_KEY_LIMIT_MODES.Unlimited
  const missing = t("keyManagement:openRouter.list.values.missing")
  const unlimitedLabel = t("keyManagement:openRouter.list.values.unlimited")
  const limit = usdFactValue(row.facts, OPENROUTER_KEY_FIELD_IDS.Limit)
  const remaining = usdFactValue(
    row.facts,
    OPENROUTER_KEY_FIELD_IDS.LimitRemaining,
  )
  const usage = usdFactValue(row.facts, OPENROUTER_KEY_FIELD_IDS.Usage)

  return {
    id: row.rowKey,
    title: row.facts.displayName,
    accountLabel: row.accountName,
    ...statusPresentation(row.facts.status, t),
    secretAvailability: INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly,
    maskedLabel: row.facts.maskedLabel,
    secretAvailabilityMessage: t(
      "keyManagement:keyDetails.createResponseOnlySecret",
    ),
    summaryFacts: [
      {
        id: OPENROUTER_KEY_FIELD_IDS.Workspace,
        label: fieldLabel(OPENROUTER_KEY_FIELD_IDS.Workspace, t),
        value: row.workspaceName,
      },
      {
        id: OPENROUTER_KEY_FIELD_IDS.Limit,
        label: fieldLabel(OPENROUTER_KEY_FIELD_IDS.Limit, t),
        value: unlimited ? unlimitedLabel : limit ?? missing,
      },
      {
        id: OPENROUTER_KEY_FIELD_IDS.LimitRemaining,
        label: fieldLabel(OPENROUTER_KEY_FIELD_IDS.LimitRemaining, t),
        value: unlimited ? unlimitedLabel : remaining ?? missing,
      },
      {
        id: OPENROUTER_KEY_FIELD_IDS.Usage,
        label: fieldLabel(OPENROUTER_KEY_FIELD_IDS.Usage, t),
        value: usage ?? missing,
      },
    ],
    detailFacts: buildOpenRouterKeyResourceDetailFacts(row.facts, t),
    actions: {
      copySecret: false,
      revealSecret: false,
      verifySecret: false,
      exportSecret: false,
      edit: row.facts.actions.canUpdate,
      delete: row.facts.actions.canDelete,
      batchSelect: false,
    },
  }
}
