import { CURRENCIES } from "~/constants/money"
import { UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS } from "~/services/accounts/keys/runtimeKeyModelAccess"
import type { BudgetWindow } from "~/services/amounts/budgets"
import {
  ASSET_KINDS,
  BUDGET_AMOUNT_FIELDS,
  BUDGET_LIMIT_STATES,
  BUDGET_PERIODS,
  BUDGET_WINDOW_KINDS,
} from "~/services/amounts/financialConstants"
import { keyBudgetFact } from "~/services/apiAdapters/accountKeyResources/budgetFacts"
import type {
  AccountKeyFactContext,
  AccountKeyResourceProviderFacts,
} from "~/services/apiAdapters/accountKeyResources/definition"
import {
  type AccountKeyResourceFacts,
  type AccountKeyScope,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { type OpenRouterKeyResourceConfig } from "~/services/apiAdapters/openrouter/keys/accountKeyResourceConfig"
import {
  toLimitMode,
  toLimitReset,
  type OpenRouterKeyDetail,
} from "~/services/apiAdapters/openrouter/keys/keyEditorSession"
import { OPENROUTER_KEY_FIELD_IDS } from "~/services/apiAdapters/openrouter/keys/keyResourceFields"
import {
  type OpenRouterKeyInfo,
  type OpenRouterWorkspace,
} from "~/services/apiService/openrouter"
import { t } from "~/utils/i18n/core"

export const getWorkspaceDisplayName = (
  workspace: OpenRouterWorkspace,
): string => workspace.name.trim() || workspace.slug

export const workspaceScope = (
  workspace: OpenRouterWorkspace,
  defaultWorkspaceId: string,
): AccountKeyScope => ({
  scopeKey: workspace.id,
  routeKey: workspace.slug,
  displayName: getWorkspaceDisplayName(workspace),
  isDefault: workspace.id === defaultWorkspaceId,
  ...(workspace.id === defaultWorkspaceId || workspace.slug === workspace.name
    ? {}
    : { secondaryLabel: workspace.slug }),
})

// OpenRouter documents only the opaque `creator_user_id` on key responses; it
// does not provide a human-facing member name there. Project only a localized
// presence label and keep the identifier confined to the mutation projection.
const toCreatorDisplay = (creatorUserId: string | null): string =>
  creatorUserId
    ? t("keyManagement:openRouter.editor.options.creator.unknown")
    : t("keyManagement:openRouter.editor.options.creator.none")

export const toDetail = (
  config: OpenRouterKeyResourceConfig,
  key: OpenRouterKeyInfo,
  scope?: AccountKeyScope,
): OpenRouterKeyDetail => ({
  key,
  workspaceDisplay:
    config.workspaceNames.get(key.workspace_id) ??
    scope?.displayName ??
    t("keyManagement:openRouter.editor.options.workspace.unknown"),
  creatorDisplay: toCreatorDisplay(key.creator_user_id),
})

export const toFacts = (
  detail: OpenRouterKeyDetail,
  ref: AccountKeyResourceFacts["ref"],
  context: AccountKeyFactContext,
): AccountKeyResourceProviderFacts => {
  const key = detail.key
  const expired = key.expires_at
    ? Date.parse(key.expires_at) <= Date.now()
    : false
  const status = expired ? "expired" : key.disabled ? "disabled" : "enabled"
  const field = OPENROUTER_KEY_FIELD_IDS
  const window: BudgetWindow =
    key.limit_reset === "daily"
      ? { kind: BUDGET_WINDOW_KINDS.Periodic, period: BUDGET_PERIODS.Day }
      : key.limit_reset === "weekly"
        ? { kind: BUDGET_WINDOW_KINDS.Periodic, period: BUDGET_PERIODS.Week }
        : key.limit_reset === "monthly"
          ? { kind: BUDGET_WINDOW_KINDS.Periodic, period: BUDGET_PERIODS.Month }
          : { kind: BUDGET_WINDOW_KINDS.Lifetime }
  const budget = keyBudgetFact(ref, context, {
    fieldId: field.Limit,
    operation: "keys/limit",
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
    limitState:
      key.limit === null
        ? BUDGET_LIMIT_STATES.Unlimited
        : BUDGET_LIMIT_STATES.Finite,
    limit: key.limit,
    remaining: key.limit_remaining,
    includesByok: key.include_byok_in_limit,
    window,
    scope: { workspaceId: key.workspace_id },
  })
  return {
    ref,
    displayName: key.name,
    maskedLabel: key.label,
    runtimeSecret: undefined,
    status,
    runtimeKey: {
      modelAccess: UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS,
      createdAt: Date.parse(key.created_at),
    },
    displayFacts: [
      { ...budget, metric: BUDGET_AMOUNT_FIELDS.Limit },
      {
        ...budget,
        fieldId: field.LimitRemaining,
        metric: BUDGET_AMOUNT_FIELDS.Remaining,
      },
      ...(
        [
          [
            field.Usage,
            field.ByokUsage,
            key.usage,
            key.byok_usage,
            { kind: BUDGET_WINDOW_KINDS.Lifetime },
          ],
          [
            field.UsageDaily,
            field.ByokUsageDaily,
            key.usage_daily,
            key.byok_usage_daily,
            { kind: BUDGET_WINDOW_KINDS.Periodic, period: "day" },
          ],
          [
            field.UsageWeekly,
            field.ByokUsageWeekly,
            key.usage_weekly,
            key.byok_usage_weekly,
            { kind: BUDGET_WINDOW_KINDS.Periodic, period: "week" },
          ],
          [
            field.UsageMonthly,
            field.ByokUsageMonthly,
            key.usage_monthly,
            key.byok_usage_monthly,
            { kind: BUDGET_WINDOW_KINDS.Periodic, period: "month" },
          ],
        ] as const
      ).flatMap(([fieldId, byokFieldId, used, byokUsed, window]) => {
        const fact = keyBudgetFact(ref, context, {
          fieldId,
          operation: `keys/${fieldId}`,
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          limitState: BUDGET_LIMIT_STATES.Unknown,
          used,
          byokUsed,
          usedIncludesByok: false,
          window,
          scope: { workspaceId: key.workspace_id },
        })
        return [
          { ...fact, metric: BUDGET_AMOUNT_FIELDS.Used },
          {
            ...fact,
            fieldId: byokFieldId,
            metric: BUDGET_AMOUNT_FIELDS.ByokUsed,
          },
        ]
      }),
    ],
    fields: [
      { fieldId: field.Name, kind: "text", value: key.name },
      {
        fieldId: field.Workspace,
        kind: "text",
        value: detail.workspaceDisplay,
      },
      {
        fieldId: field.Creator,
        kind: "text",
        value: detail.creatorDisplay,
      },
      { fieldId: field.LimitMode, kind: "text", value: toLimitMode(key.limit) },
      {
        fieldId: field.LimitReset,
        kind: "text",
        value: toLimitReset(key.limit_reset),
      },
      { fieldId: field.Disabled, kind: "boolean", value: key.disabled },
      {
        fieldId: field.IncludeByokInLimit,
        kind: "boolean",
        value: key.include_byok_in_limit,
      },
      { fieldId: field.CreatedAt, kind: "text", value: key.created_at },
      ...(key.updated_at
        ? [
            {
              fieldId: field.UpdatedAt,
              kind: "text" as const,
              value: key.updated_at,
            },
          ]
        : []),
      ...(key.expires_at
        ? [
            {
              fieldId: field.ExpiresAt,
              kind: "text" as const,
              value: key.expires_at,
            },
          ]
        : []),
    ],
    searchValues: [
      key.name,
      key.label,
      status,
      detail.workspaceDisplay,
      detail.creatorDisplay,
    ],
    actions: { canUpdate: true, canDelete: true },
  }
}
