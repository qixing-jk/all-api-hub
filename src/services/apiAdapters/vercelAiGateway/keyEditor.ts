import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/keys/accountKeyNames"
import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/definition"
import type { AccountKeyCreationIntent } from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  RESOURCE_FIELD_ISSUE_CODES,
  RESOURCE_FIELD_TYPES,
  type ResourceFieldDescriptor,
  type ResourceFieldIssue,
} from "~/services/apiAdapters/contracts/resourceNative"
import {
  VERCEL_BUDGET_ALERT_THRESHOLDS,
  VERCEL_BUDGET_MINIMUM_USD,
  VERCEL_BUDGET_PERIODS,
  VERCEL_BUDGET_REFRESH_PERIODS,
  VERCEL_KEY_SPEND_ATTRIBUTIONS,
  type VercelAiGatewayKey,
  type VercelAiGatewayKeyCreateInput,
  type VercelKeyBudgetInput,
  type VercelKeySpendAttribution,
} from "~/services/apiService/vercelAiGateway/keys"

/** Stable editor field ids shared by the adapter and its presentation. */
export const vercelKeyFields = {
  Name: "name",
  ExpiresAt: "expires_at",
  SpendAttribution: "spend_attribution",
  BudgetEnabled: "budget_enabled",
  BudgetLimit: "budget_limit",
  BudgetPeriod: "budget_period",
  BudgetAlerts: "budget_alerts",
} as const

export type VercelKeyCommand = VercelAiGatewayKeyCreateInput & {
  removeBudget?: boolean
}

const attributionValues: readonly string[] = Object.values(
  VERCEL_KEY_SPEND_ATTRIBUTIONS,
)
const budgetAlertValues = VERCEL_BUDGET_ALERT_THRESHOLDS.map(String)

/** DateTime projections arrive as ISO strings; Vercel stores epoch milliseconds. */
const toEpochMs = (value: unknown): number | undefined => {
  if (typeof value !== "string" || !value.trim()) return undefined
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : undefined
}

/**
 * Mirrors the native create dialog: required name, optional expiry and spend
 * attribution (default `user`). Verified 2026-10-24 on the AI Gateway console.
 */
export function createVercelKeyEditor(
  intent?: AccountKeyCreationIntent,
  options: { key?: VercelAiGatewayKey; canSetAttribution?: boolean } = {},
): AccountKeyResourceEditorDefinition<VercelKeyCommand> {
  const key = options.key
  const canSetAttribution = options.canSetAttribution !== false
  const budget = key?.budget
  const fields: ResourceFieldDescriptor[] = [
    {
      fieldId: vercelKeyFields.Name,
      type: RESOURCE_FIELD_TYPES.Text,
      required: true,
      readOnly: !!key,
    },
    {
      fieldId: vercelKeyFields.ExpiresAt,
      type: RESOURCE_FIELD_TYPES.DateTime,
      nullable: true,
      readOnly: !!key,
    },
    {
      fieldId: vercelKeyFields.SpendAttribution,
      type: RESOURCE_FIELD_TYPES.Select,
      options: attributionValues.map((value) => ({ value })),
    },
    {
      fieldId: vercelKeyFields.BudgetEnabled,
      type: RESOURCE_FIELD_TYPES.Boolean,
    },
    {
      fieldId: vercelKeyFields.BudgetLimit,
      type: RESOURCE_FIELD_TYPES.Number,
      min: VERCEL_BUDGET_MINIMUM_USD,
      step: 0.01,
    },
    {
      fieldId: vercelKeyFields.BudgetPeriod,
      type: RESOURCE_FIELD_TYPES.Select,
      options: VERCEL_BUDGET_PERIODS.map((value) => ({ value })),
    },
    {
      fieldId: vercelKeyFields.BudgetAlerts,
      type: RESOURCE_FIELD_TYPES.MultiSelect,
      options: budgetAlertValues.map((value) => ({
        value,
        displayLabel: `${value}%`,
      })),
    },
  ]
  return {
    fields: fields.filter(
      (field) =>
        canSetAttribution || field.fieldId !== vercelKeyFields.SpendAttribution,
    ),
    initialValues: {
      [vercelKeyFields.Name]:
        key?.name ||
        intent?.nameHint?.trim() ||
        DEFAULT_AUTO_PROVISION_KEY_NAME,
      [vercelKeyFields.ExpiresAt]: key?.expiresAt
        ? new Date(key.expiresAt).toISOString()
        : null,
      // The console defaults new keys to user attribution.
      ...(canSetAttribution
        ? {
            [vercelKeyFields.SpendAttribution]: key
              ? key.spendAttribution ?? VERCEL_KEY_SPEND_ATTRIBUTIONS.Team
              : VERCEL_KEY_SPEND_ATTRIBUTIONS.User,
          }
        : {}),
      [vercelKeyFields.BudgetEnabled]: !!budget,
      [vercelKeyFields.BudgetLimit]: budget?.limitAmount ?? null,
      [vercelKeyFields.BudgetPeriod]:
        budget?.refreshPeriod ?? VERCEL_BUDGET_REFRESH_PERIODS.None,
      [vercelKeyFields.BudgetAlerts]: budget?.alertThresholds.map(String) ?? [],
    },
    validate(values) {
      const issues: ResourceFieldIssue[] = []
      const name = values[vercelKeyFields.Name]
      if (!key && (typeof name !== "string" || !name.trim()))
        issues.push({
          fieldId: vercelKeyFields.Name,
          code: RESOURCE_FIELD_ISSUE_CODES.Required,
        })
      const expiresAt = values[vercelKeyFields.ExpiresAt]
      if (
        !key &&
        expiresAt !== null &&
        expiresAt !== undefined &&
        expiresAt !== ""
      ) {
        const timestamp = toEpochMs(expiresAt)
        if (timestamp === undefined)
          issues.push({
            fieldId: vercelKeyFields.ExpiresAt,
            code: RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
          })
        else if (timestamp <= Date.now())
          issues.push({
            fieldId: vercelKeyFields.ExpiresAt,
            code: RESOURCE_FIELD_ISSUE_CODES.OutOfRange,
          })
      }
      const attribution = values[vercelKeyFields.SpendAttribution]
      if (values[vercelKeyFields.BudgetEnabled] === true) {
        const limit = values[vercelKeyFields.BudgetLimit]
        if (
          typeof limit !== "number" ||
          !Number.isFinite(limit) ||
          limit < VERCEL_BUDGET_MINIMUM_USD
        )
          issues.push({
            fieldId: vercelKeyFields.BudgetLimit,
            code: RESOURCE_FIELD_ISSUE_CODES.OutOfRange,
          })
        if (
          !VERCEL_BUDGET_PERIODS.includes(
            values[
              vercelKeyFields.BudgetPeriod
            ] as VercelKeyBudgetInput["refreshPeriod"],
          )
        )
          issues.push({
            fieldId: vercelKeyFields.BudgetPeriod,
            code: RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
          })
        const alerts = values[vercelKeyFields.BudgetAlerts]
        if (
          !Array.isArray(alerts) ||
          alerts.some((value) => !budgetAlertValues.includes(value))
        )
          issues.push({
            fieldId: vercelKeyFields.BudgetAlerts,
            code: RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
          })
      }
      if (
        canSetAttribution &&
        attribution !== undefined &&
        (typeof attribution !== "string" ||
          !attributionValues.includes(attribution))
      )
        issues.push({
          fieldId: vercelKeyFields.SpendAttribution,
          code: RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
        })
      return issues.length ? { valid: false, issues } : { valid: true }
    },
    buildCommand: (values) => {
      const expiresAt = toEpochMs(values[vercelKeyFields.ExpiresAt])
      const attribution = values[vercelKeyFields.SpendAttribution]
      return {
        ...(!key ? { name: String(values[vercelKeyFields.Name]).trim() } : {}),
        ...(key && values[vercelKeyFields.BudgetEnabled] !== true
          ? { removeBudget: true }
          : {}),
        ...(values[vercelKeyFields.BudgetEnabled] === true
          ? {
              aiGatewayQuota: {
                limitAmount: values[vercelKeyFields.BudgetLimit] as number,
                refreshPeriod: values[
                  vercelKeyFields.BudgetPeriod
                ] as VercelKeyBudgetInput["refreshPeriod"],
                alertThresholds: [
                  ...new Set(
                    (
                      values[vercelKeyFields.BudgetAlerts] as readonly string[]
                    ).map(Number),
                  ),
                ].sort((a, b) => a - b),
              },
            }
          : {}),
        ...(!key && expiresAt ? { expiresAt } : {}),
        ...(canSetAttribution &&
        typeof attribution === "string" &&
        attributionValues.includes(attribution)
          ? { spendAttribution: attribution as VercelKeySpendAttribution }
          : {}),
      }
    },
  }
}
