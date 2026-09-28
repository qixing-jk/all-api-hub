import { QUOTA_PER_USD } from "~/constants/money"
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
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
import { reportsRixApiV6TokenColumns } from "~/services/apiService/newApiFamily/variants/rixApiDialects"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

import { readPreservedTokenFields } from "./tokenPreservedFields"
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
  /**
   * Rix API 6.x columns this editor exposes on top of the New API projection.
   * The deployment keeps a count quota next to the amount quota, an IP deny
   * list next to the allow list, the media storage node and whether the key may
   * fail over to other groups.
   */
  CountUnlimited: "unlimited_count",
  RemainingCount: "remain_count",
  ExcludeIps: "exclude_ips",
  StorageLocation: "storage_location",
  GroupOnly: "group_only",
} as const

/** Storage nodes a Rix API token can pin; an unset column keeps the default. */
const RIX_API_STORAGE_LOCATIONS = ["global", "none"] as const

const field = NEW_API_KEY_FIELD_IDS
const quotaPerUsd = QUOTA_PER_USD

/** Reads a deployment-owned boolean that this editor now presents. */
const readOwnedBoolean = (body: NewApiTokenWriteBody, key: string): boolean =>
  body[key] === true

/** Reads a deployment-owned number that a row may deliver as a decimal string. */
const readOwnedNumber = (
  body: NewApiTokenWriteBody,
  key: string,
): number | undefined => {
  const value = body[key]
  const coerced = typeof value === "string" ? Number(value.trim()) : value

  return typeof coerced === "number" && Number.isFinite(coerced)
    ? coerced
    : undefined
}

/** Reads a deployment-owned string column. */
const readOwnedString = (body: NewApiTokenWriteBody, key: string): string =>
  typeof body[key] === "string" ? (body[key] as string) : ""

export type NewApiKeyEditCommand = {
  baseline: NewApiTokenWriteBody
  values: NewApiTokenWriteBody
}

/**
 * Token write body: the canonical projection plus the deployment-managed fields
 * the editor does not own, so an update cannot clear them.
 */
export type NewApiTokenWriteBody = NewApiTokenWrite & Record<string, unknown>

/**
 * Preserve optional upstream settings that the ordinary editor does not own.
 * @param token Row as the deployment returned it.
 * @param siteType Site type the write targets, which decides how much of the row
 *   travels back (see `readPreservedTokenFields`).
 * @returns Write body shared by the create, update and comparison paths.
 */
export const toNewApiTokenWrite = (
  token: NewApiToken,
  siteType?: AccountSiteType,
): NewApiTokenWriteBody => ({
  ...readPreservedTokenFields(siteType, token),
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
    (intent?.allowedGroups?.length === 1 ? intent.allowedGroups[0] ?? "" : "")
  const baseline: NewApiTokenWriteBody = token
    ? toNewApiTokenWrite(token, siteType)
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
  // Rix API 6.x owns columns this editor presents; a probed older generation
  // keeps the New API projection only.
  const exposesDeploymentFields =
    siteType === SITE_TYPES.RIX_API &&
    reportsRixApiV6TokenColumns(request.baseUrl)
  // A generation that never reported a column does not get it written back: a
  // new key takes this editor's defaults, an existing row only carries the
  // columns its own deployment returned.
  const ownsBaselineField = (key: string): boolean =>
    token === undefined || Object.hasOwn(baseline, key)
  const deploymentFieldEntries = (
    entries: Partial<Record<string, unknown>>,
  ): Partial<Record<string, unknown>> => {
    if (!exposesDeploymentFields) return {}

    const owned: Partial<Record<string, unknown>> = {}
    for (const [key, value] of Object.entries(entries)) {
      if (ownsBaselineField(key)) owned[key] = value
    }
    return owned
  }
  // A new key keeps unlimited counts: the deployment's own create default, and
  // the only value that cannot exhaust the key's call quota before first use.
  const unlimitedCount = token
    ? readOwnedBoolean(baseline, field.CountUnlimited)
    : true
  const initialValues: EditableResourceProjection = {
    [field.Name]: baseline.name,
    [field.Quota]: Math.max(0, baseline.remain_quota) / quotaPerUsd,
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
    ...(exposesDeploymentFields
      ? {
          [field.CountUnlimited]: unlimitedCount,
          [field.RemainingCount]:
            readOwnedNumber(baseline, field.RemainingCount) ?? 0,
          [field.ExcludeIps]: readOwnedString(baseline, field.ExcludeIps),
          [field.StorageLocation]:
            readOwnedString(baseline, field.StorageLocation) || null,
          [field.GroupOnly]: readOwnedBoolean(baseline, field.GroupOnly),
        }
      : {}),
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
      ...(exposesDeploymentFields
        ? ([
            {
              fieldId: field.CountUnlimited,
              type: RESOURCE_FIELD_TYPES.Boolean,
            },
            {
              fieldId: field.RemainingCount,
              type: RESOURCE_FIELD_TYPES.Number,
              min: 0,
              step: 1,
            },
            { fieldId: field.ExcludeIps, type: RESOURCE_FIELD_TYPES.Textarea },
            {
              fieldId: field.StorageLocation,
              type: RESOURCE_FIELD_TYPES.Select,
              options: RIX_API_STORAGE_LOCATIONS.map((value) => ({
                value,
                displayLabel: value,
              })),
            },
            { fieldId: field.GroupOnly, type: RESOURCE_FIELD_TYPES.Boolean },
          ] as const)
        : []),
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
      if (exposesDeploymentFields) {
        for (const id of [field.CountUnlimited, field.GroupOnly]) {
          if (typeof values[id] !== "boolean")
            issues.push({ fieldId: id, code: "invalid_value" })
        }
        const remainingCount = values[field.RemainingCount]
        if (
          values[field.CountUnlimited] !== true &&
          (typeof remainingCount !== "number" ||
            !Number.isSafeInteger(remainingCount) ||
            remainingCount < 0)
        ) {
          issues.push({
            fieldId: field.RemainingCount,
            code: "out_of_range",
          })
        }
        if (typeof values[field.ExcludeIps] !== "string")
          issues.push({ fieldId: field.ExcludeIps, code: "invalid_value" })
        const storageLocation = values[field.StorageLocation]
        if (
          storageLocation != null &&
          (typeof storageLocation !== "string" ||
            !RIX_API_STORAGE_LOCATIONS.includes(
              storageLocation as (typeof RIX_API_STORAGE_LOCATIONS)[number],
            ))
        ) {
          issues.push({
            fieldId: field.StorageLocation,
            code: "unsupported_option",
          })
        }
        // Pinning a key to its group leaves no fallback, so it needs one.
        if (values[field.GroupOnly] === true && !String(group ?? "").trim()) {
          issues.push({ fieldId: field.Group, code: "required" })
        }
      }
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
          ...deploymentFieldEntries({
            unlimited_count: values[field.CountUnlimited] === true,
            remain_count:
              values[field.CountUnlimited] === true
                ? readOwnedNumber(baseline, field.RemainingCount) ?? 0
                : Math.round(values[field.RemainingCount] as number),
            exclude_ips: String(values[field.ExcludeIps] ?? ""),
            storage_location: String(values[field.StorageLocation] ?? ""),
            group_only: values[field.GroupOnly] === true,
          }),
        },
      }
    },
  }
}
