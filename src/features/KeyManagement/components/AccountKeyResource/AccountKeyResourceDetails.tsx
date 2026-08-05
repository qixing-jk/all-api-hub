import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"

import { Badge, Card, CardContent } from "~/components/ui"
import type {
  AccountKeyResourceFacts,
  ResourceDisplayFact,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  OPENROUTER_KEY_FIELD_IDS,
  OPENROUTER_KEY_LIMIT_MODES,
  OPENROUTER_KEY_LIMIT_RESETS,
} from "~/services/apiAdapters/openrouter/keyResourceFields"

const nativeFactFieldIds = new Set<string>([
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

const renderFactValue = (fact: ResourceDisplayFact, t: TFunction) => {
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
    default:
      return String(fact.value)
  }
}

/** Shows safe native facts only; opaque resource references never leave controller state. */
export function AccountKeyResourceDetails({
  facts,
}: {
  facts: AccountKeyResourceFacts
}) {
  const { t } = useTranslation()
  const visibleFacts = facts.fields.filter((fact) =>
    nativeFactFieldIds.has(fact.fieldId),
  )

  return (
    <Card padding="none" className="border-dashed">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-medium">
              {t("keyManagement:openRouter.list.details.heading")}
            </h3>
            <p className="text-muted-foreground truncate text-sm">
              {facts.displayName}
            </p>
          </div>
          <Badge variant="outline" size="sm">
            {facts.maskedLabel}
          </Badge>
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {visibleFacts.map((fact) => (
            <div
              key={fact.fieldId}
              className="flex min-w-0 justify-between gap-3"
            >
              <dt className="text-muted-foreground">
                {fieldLabel(fact.fieldId, t)}
              </dt>
              <dd className="min-w-0 text-right font-medium break-words">
                {renderFactValue(fact, t)}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
