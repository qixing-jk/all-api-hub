import type { TFunction } from "i18next"

import { KEY_RESOURCE_CARD_STATUSES } from "~/features/KeyManagement/presentation/keyResourceCard"
import type { NativeKeyManagementRow } from "~/features/KeyManagement/types"
import {
  ACCOUNT_KEY_FINANCIAL_FACT_KINDS,
  ACCOUNT_KEY_RESOURCE_STATUSES,
  type AccountKeyResourceFacts,
  type ResourceDisplayFact,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import { RESOURCE_DISPLAY_FACT_KINDS } from "~/services/apiAdapters/contracts/resourceNative"
import {
  OPENROUTER_KEY_FIELD_IDS,
  OPENROUTER_KEY_LIMIT_MODES,
  OPENROUTER_KEY_LIMIT_RESETS,
} from "~/services/apiAdapters/openrouter/keys/keyResourceFields"
import { SECRET_MASK } from "~/utils/core/formatters"

import type { AccountKeyResourceCardAdapter } from "./accountKeyResourceCardAdapter"
import { formatKeyFinancialFact } from "./keyBudgetPresentation"
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

const financialFactValue = (
  facts: AccountKeyResourceFacts,
  fieldId: string,
  t: TFunction,
): string | undefined => {
  const fact = facts.displayFacts?.find((fact) => fact.fieldId === fieldId)
  return fact?.kind === ACCOUNT_KEY_FINANCIAL_FACT_KINDS.BudgetConstraint
    ? formatKeyFinancialFact(fact, t)
    : undefined
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
    case RESOURCE_DISPLAY_FACT_KINDS.Boolean:
      return fact.value
        ? t("keyManagement:openRouter.list.values.yes")
        : t("keyManagement:openRouter.list.values.no")
    case RESOURCE_DISPLAY_FACT_KINDS.Text:
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
    case RESOURCE_DISPLAY_FACT_KINDS.List:
      return fact.value.join(", ")
    case RESOURCE_DISPLAY_FACT_KINDS.Secret:
      return SECRET_MASK
    case RESOURCE_DISPLAY_FACT_KINDS.Number:
      return String(fact.value)
  }
}

const statusPresentation = (
  status: AccountKeyResourceFacts["status"],
  t: TFunction,
): Pick<KeyResourceCardPresentation, "status" | "statusLabel"> => {
  switch (status) {
    case ACCOUNT_KEY_RESOURCE_STATUSES.Enabled:
      return {
        status: KEY_RESOURCE_CARD_STATUSES.Active,
        statusLabel: t("keyManagement:native.status.enabled"),
      }
    case ACCOUNT_KEY_RESOURCE_STATUSES.Disabled:
      return {
        status: KEY_RESOURCE_CARD_STATUSES.Inactive,
        statusLabel: t("keyManagement:native.status.disabled"),
      }
    case ACCOUNT_KEY_RESOURCE_STATUSES.Expired:
      return {
        status: KEY_RESOURCE_CARD_STATUSES.Inactive,
        statusLabel: t("keyManagement:native.status.expired"),
      }
    default:
      return {
        status: KEY_RESOURCE_CARD_STATUSES.Unknown,
        statusLabel: t("keyManagement:native.status.unknown"),
      }
  }
}

export const buildOpenRouterKeyResourceDetailFacts = (
  facts: AccountKeyResourceFacts,
  t: TFunction,
): KeyResourceFact[] =>
  [
    ...(facts.displayFacts ?? []).flatMap((fact) =>
      fact.kind === ACCOUNT_KEY_FINANCIAL_FACT_KINDS.BudgetConstraint
        ? [
            {
              id: fact.fieldId,
              label: fieldLabel(fact.fieldId, t),
              value: formatKeyFinancialFact(fact, t),
            },
          ]
        : [],
    ),
    ...facts.fields
      .filter((fact) => detailFieldIds.has(fact.fieldId))
      .map((fact) => ({
        id: fact.fieldId,
        label: fieldLabel(fact.fieldId, t),
        value: displayFactValue(fact, t),
      })),
  ].sort(
    (left, right) =>
      [...detailFieldIds].indexOf(left.id) -
      [...detailFieldIds].indexOf(right.id),
  )

export const buildOpenRouterKeyResourceCardPresentation = (
  row: NativeKeyManagementRow,
  t: TFunction,
  options: { hasAssociatedSecret?: boolean } = {},
): KeyResourceCardPresentation => {
  const hasAssociatedSecret = options.hasAssociatedSecret === true
  const missing = t("keyManagement:openRouter.list.values.missing")
  const limit = financialFactValue(row.facts, OPENROUTER_KEY_FIELD_IDS.Limit, t)
  const remaining = financialFactValue(
    row.facts,
    OPENROUTER_KEY_FIELD_IDS.LimitRemaining,
    t,
  )
  const usage = financialFactValue(row.facts, OPENROUTER_KEY_FIELD_IDS.Usage, t)
  const contextFact = {
    id: OPENROUTER_KEY_FIELD_IDS.Workspace,
    label: fieldLabel(OPENROUTER_KEY_FIELD_IDS.Workspace, t),
    value: row.scopeName,
  }

  return {
    id: row.rowKey,
    title: row.facts.displayName,
    accountLabel: row.accountName,
    ...statusPresentation(row.facts.status, t),
    secretAvailability: hasAssociatedSecret
      ? INVENTORY_SECRET_AVAILABILITIES.Recoverable
      : INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly,
    maskedLabel: row.facts.maskedLabel,
    ...(hasAssociatedSecret
      ? {}
      : {
          secretAvailabilityMessage: t(
            "keyManagement:keyDetails.createResponseOnlySecret",
          ),
        }),
    contextFact,
    summaryFacts: [
      contextFact,
      {
        id: OPENROUTER_KEY_FIELD_IDS.Limit,
        label: fieldLabel(OPENROUTER_KEY_FIELD_IDS.Limit, t),
        value: limit ?? missing,
      },
      {
        id: OPENROUTER_KEY_FIELD_IDS.LimitRemaining,
        label: fieldLabel(OPENROUTER_KEY_FIELD_IDS.LimitRemaining, t),
        value: remaining ?? missing,
      },
      {
        id: OPENROUTER_KEY_FIELD_IDS.Usage,
        label: fieldLabel(OPENROUTER_KEY_FIELD_IDS.Usage, t),
        value: usage ?? missing,
      },
    ],
    detailFacts: buildOpenRouterKeyResourceDetailFacts(row.facts, t),
    actions: {
      copySecret: hasAssociatedSecret,
      revealSecret: hasAssociatedSecret,
      verifySecret: hasAssociatedSecret,
      exportSecret: hasAssociatedSecret,
      edit: row.facts.actions.canUpdate,
      delete: row.facts.actions.canDelete,
      batchSelect: false,
    },
  }
}

export const openRouterKeyResourceCardAdapter: AccountKeyResourceCardAdapter = {
  buildPresentation: buildOpenRouterKeyResourceCardPresentation,
  buildDetailFacts: buildOpenRouterKeyResourceDetailFacts,
  getDetailsLoadFailedMessage: (t) =>
    t("keyManagement:openRouter.list.details.loadFailed"),
}
