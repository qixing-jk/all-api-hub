import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { getDefaultAccountKeyName } from "~/services/accounts/accountKeyNames"
import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/factory"
import type { AccountKeyCreationIntent } from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  RESOURCE_FIELD_TYPES,
  type EditableResourceProjection,
  type ResourceFieldIssue,
} from "~/services/apiAdapters/contracts/resourceNative"
import { resourceValuesEqual } from "~/services/apiAdapters/nativeResources/editableChanges"
import type {
  NewApiToken,
  NewApiTokenWrite,
} from "~/services/apiService/newApiFamily/tokenTypes"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

import type { NewApiFamilyTokenTransport } from "./tokenTransport"

const NEW_API_KEY_FIELD_IDS = {
  Name: "name",
  Quota: "quotaUsd",
  Unlimited: "unlimited_quota",
  ExpiresAt: "expires_at",
  Group: "group",
  ModelLimitsEnabled: "model_limits_enabled",
  Models: "model_limits",
  AllowIps: "allow_ips",
} as const

const field = NEW_API_KEY_FIELD_IDS
const quotaPerUsd = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR

export type NewApiKeyEditCommand = {
  baseline: NewApiTokenWrite
  values: NewApiTokenWrite
}

/** Preserve optional upstream settings that the ordinary editor does not own. */
export const toNewApiTokenWrite = (token: NewApiToken): NewApiTokenWrite => ({
  name: token.name,
  remain_quota: token.remain_quota,
  expired_time: token.expired_time,
  unlimited_quota: token.unlimited_quota,
  model_limits_enabled: token.model_limits_enabled ?? false,
  model_limits: token.model_limits ?? token.models ?? "",
  allow_ips: token.allow_ips ?? "",
  group: token.group ?? "",
  ...(token.cross_group_retry === undefined
    ? {}
    : { cross_group_retry: token.cross_group_retry }),
  ...(token.auto_groups === undefined
    ? {}
    : { auto_groups: token.auto_groups }),
})

/** Native New API projection: dollar quota and UTC expiry convert only here. */
export function createNewApiKeyEditor(
  siteType: AccountSiteType,
  request: ApiServiceRequest,
  transport: NewApiFamilyTokenTransport,
  token?: NewApiToken,
  intent?: AccountKeyCreationIntent,
): AccountKeyResourceEditorDefinition<NewApiKeyEditCommand> {
  const initialGroup =
    intent?.preferredGroup ??
    (intent?.allowedGroups?.length === 1 ? intent.allowedGroups[0] : "")
  const baseline: NewApiTokenWrite = token
    ? toNewApiTokenWrite(token)
    : {
        name:
          intent?.nameHint?.trim() || getDefaultAccountKeyName(initialGroup),
        remain_quota: siteType === SITE_TYPES.MODELFLARE ? -1 : 0,
        expired_time: -1,
        unlimited_quota: true,
        model_limits_enabled: Boolean(intent?.modelContext),
        model_limits: intent?.modelContext?.modelId ?? "",
        allow_ips: "",
        group: initialGroup,
      }
  const allowedGroups = token ? undefined : intent?.allowedGroups
  const initialValues: EditableResourceProjection = {
    [field.Name]: baseline.name,
    [field.Quota]: baseline.remain_quota / quotaPerUsd,
    [field.Unlimited]: baseline.unlimited_quota,
    [field.ExpiresAt]:
      baseline.expired_time === -1
        ? ""
        : new Date(baseline.expired_time * 1000).toISOString(),
    [field.Group]: baseline.group || null,
    [field.ModelLimitsEnabled]: baseline.model_limits_enabled,
    [field.Models]: baseline.model_limits
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
    [field.AllowIps]: baseline.allow_ips,
  }
  return {
    fields: [
      { fieldId: field.Name, type: RESOURCE_FIELD_TYPES.Text, required: true },
      { fieldId: field.Unlimited, type: RESOURCE_FIELD_TYPES.Boolean },
      {
        fieldId: field.Quota,
        type: RESOURCE_FIELD_TYPES.Number,
        min: 0,
        step: 1 / quotaPerUsd,
      },
      {
        fieldId: field.ExpiresAt,
        type: RESOURCE_FIELD_TYPES.DateTime,
        nullable: true,
      },
      ...(siteType === SITE_TYPES.ONE_API
        ? []
        : [
            {
              fieldId: field.Group,
              type: RESOURCE_FIELD_TYPES.Select,
              nullable: siteType !== SITE_TYPES.MODELFLARE,
              options: baseline.group
                ? [{ value: baseline.group, displayLabel: baseline.group }]
                : [],
              optionLoader: { dependsOn: [] },
            } as const,
          ]),
      { fieldId: field.ModelLimitsEnabled, type: RESOURCE_FIELD_TYPES.Boolean },
      {
        fieldId: field.Models,
        type: RESOURCE_FIELD_TYPES.MultiSelect,
        options: (initialValues[field.Models] as string[]).map((value) => ({
          value,
          displayLabel: value,
        })),
        optionLoader: { dependsOn: [] },
      },
      { fieldId: field.AllowIps, type: RESOURCE_FIELD_TYPES.Textarea },
    ],
    initialValues,
    validate(values) {
      const issues: ResourceFieldIssue[] = []
      if (
        typeof values[field.Name] !== "string" ||
        !String(values[field.Name]).trim()
      ) {
        issues.push({ fieldId: field.Name, code: "required" })
      }
      for (const id of [field.Unlimited, field.ModelLimitsEnabled]) {
        if (typeof values[id] !== "boolean")
          issues.push({ fieldId: id, code: "invalid_value" })
      }
      const quota = values[field.Quota]
      if (
        !values[field.Unlimited] &&
        (typeof quota !== "number" ||
          !Number.isFinite(quota) ||
          quota < 0 ||
          !Number.isSafeInteger(Math.round(quota * quotaPerUsd)))
      ) {
        issues.push({ fieldId: field.Quota, code: "out_of_range" })
      }
      const expiry = values[field.ExpiresAt]
      if (
        expiry &&
        (typeof expiry !== "string" || !Number.isFinite(Date.parse(expiry)))
      ) {
        issues.push({ fieldId: field.ExpiresAt, code: "invalid_value" })
      }
      const group = values[field.Group]
      if (allowedGroups && !allowedGroups.includes(String(group ?? ""))) {
        issues.push({ fieldId: field.Group, code: "required" })
      }
      if (
        (group != null && typeof group !== "string") ||
        (siteType === SITE_TYPES.MODELFLARE && !group)
      ) {
        issues.push({ fieldId: field.Group, code: "required" })
      }
      const models = values[field.Models]
      if (
        !Array.isArray(models) ||
        models.some((id) => typeof id !== "string")
      ) {
        issues.push({ fieldId: field.Models, code: "invalid_value" })
      }
      if (typeof values[field.AllowIps] !== "string")
        issues.push({ fieldId: field.AllowIps, code: "invalid_value" })
      return issues.length ? { valid: false, issues } : { valid: true }
    },
    async loadOptions(fieldId, _values, options) {
      const optionRequest = {
        ...request,
        ...(options?.signal ? { abortSignal: options.signal } : {}),
      }
      if (fieldId === field.Group) {
        const groups = await transport.fetchUserGroups(optionRequest)
        return Object.entries(groups)
          .filter(([value]) => !allowedGroups || allowedGroups.includes(value))
          .map(([value, info]) => ({
            value,
            displayLabel: value,
            secondaryLabel: info.desc,
          }))
      }
      if (fieldId === field.Models)
        return (await transport.fetchAccountAvailableModels(optionRequest)).map(
          (value) => ({ value, displayLabel: value }),
        )
      return []
    },
    buildCommand(values) {
      const unlimited = values[field.Unlimited] === true
      const expiresAt = values[field.ExpiresAt] as string
      return {
        baseline,
        values: {
          ...baseline,
          name: (values[field.Name] as string).trim(),
          unlimited_quota: unlimited,
          remain_quota: unlimited
            ? baseline.remain_quota
            : Math.round((values[field.Quota] as number) * quotaPerUsd),
          expired_time: expiresAt
            ? Math.floor(Date.parse(expiresAt) / 1000)
            : -1,
          group: (values[field.Group] as string | null) ?? "",
          model_limits_enabled: values[field.ModelLimitsEnabled] === true,
          model_limits: resourceValuesEqual(
            values[field.Models],
            initialValues[field.Models],
          )
            ? baseline.model_limits
            : (values[field.Models] as string[]).join(","),
          allow_ips: values[field.AllowIps] as string,
        },
      }
    },
  }
}
