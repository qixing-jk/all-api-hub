import { UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS } from "~/services/accounts/runtimeKeyModelAccess"
import {
  type AccountKeyResourceFacts,
  type AccountKeyScope,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { type OpenRouterKeyResourceConfig } from "~/services/apiAdapters/openrouter/accountKeyResourceConfig"
import {
  toLimitMode,
  toLimitReset,
  type OpenRouterKeyDetail,
} from "~/services/apiAdapters/openrouter/keyEditorSession"
import { OPENROUTER_KEY_FIELD_IDS } from "~/services/apiAdapters/openrouter/keyResourceFields"
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
): AccountKeyResourceFacts => {
  const key = detail.key
  const expired = key.expires_at
    ? Date.parse(key.expires_at) <= Date.now()
    : false
  const status = expired ? "expired" : key.disabled ? "disabled" : "enabled"
  const field = OPENROUTER_KEY_FIELD_IDS
  return {
    ref,
    displayName: key.name,
    maskedLabel: key.label,
    status,
    runtimeKey: {
      modelAccess: UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS,
      createdAt: Date.parse(key.created_at),
    },
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
      ...(key.limit === null
        ? []
        : [
            { fieldId: field.Limit, kind: "number" as const, value: key.limit },
          ]),
      ...(key.limit_remaining === null
        ? []
        : [
            {
              fieldId: field.LimitRemaining,
              kind: "number" as const,
              value: key.limit_remaining,
            },
          ]),
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
      { fieldId: field.Usage, kind: "number", value: key.usage },
      {
        fieldId: field.UsageDaily,
        kind: "number",
        value: key.usage_daily,
      },
      {
        fieldId: field.UsageWeekly,
        kind: "number",
        value: key.usage_weekly,
      },
      {
        fieldId: field.UsageMonthly,
        kind: "number",
        value: key.usage_monthly,
      },
      { fieldId: field.ByokUsage, kind: "number", value: key.byok_usage },
      {
        fieldId: field.ByokUsageDaily,
        kind: "number",
        value: key.byok_usage_daily,
      },
      {
        fieldId: field.ByokUsageWeekly,
        kind: "number",
        value: key.byok_usage_weekly,
      },
      {
        fieldId: field.ByokUsageMonthly,
        kind: "number",
        value: key.byok_usage_monthly,
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
