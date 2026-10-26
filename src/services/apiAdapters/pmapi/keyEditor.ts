import { QUOTA_PER_USD } from "~/constants/money"
import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/keys/accountKeyNames"
import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/definition"
import { ACCOUNT_KEY_RESOURCE_EDIT_ACTIONS as editActions } from "~/services/apiAdapters/contracts/accountKeyResource"
import type { AccountKeyResourceEditIntent } from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  RESOURCE_FIELD_TYPES as fieldTypes,
  RESOURCE_FIELD_ISSUE_CODES as issueCodes,
} from "~/services/apiAdapters/contracts/resourceNative"
import type { ResourceFieldIssue } from "~/services/apiAdapters/contracts/resourceNative"
import {
  PMAPI_KEY_NEVER_EXPIRES,
  PMAPI_KEY_STATUSES,
} from "~/services/apiService/pmapi/constants"
import type {
  PmApiKey,
  PmApiKeyInput,
  PmApiTokenGroup,
} from "~/services/apiService/pmapi/keys"

import { PMAPI_KEY_EDITOR_FIELDS as fields } from "./keyResourceFields"

/** Edit commands: rotate the secret, or apply a partial field payload. */
export type PmApiKeyEditCommand = {
  rotate: boolean
  payload: Partial<PmApiKeyInput> & {
    status?:
      | typeof PMAPI_KEY_STATUSES.Enabled
      | typeof PMAPI_KEY_STATUSES.Disabled
  }
}

/** Console model whitelist rows are comma separated; empty means every model. */
const parseModelList = (value: unknown): string[] =>
  typeof value === "string"
    ? value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : []

/**
 * Native editor mirroring the console's token dialog: one billing group,
 * a quota cap with an unlimited switch, an arbitrary expiry timestamp, a model
 * whitelist, an IP/CIDR restriction, and a per-minute request cap.
 */
export function createPmApiKeyEditor(params: {
  groups: readonly PmApiTokenGroup[]
  models: readonly string[]
  detail?: PmApiKey
  nameHint?: string
}): AccountKeyResourceEditorDefinition<PmApiKeyInput> {
  const { groups, models, detail, nameHint } = params
  // The empty value is the nullable "follows account group" option, which the
  // presentation policy labels; listing it again here would duplicate it.
  const groupOptions =
    // The console token form offers bare group names; the pricing catalogue
    // adds descriptions, so the editor shows name + ratio like the console.
    groups.map((group) => ({
      value: group.name,
      displayLabel: group.description ?? group.name,
      secondaryLabel: `×${group.ratio}`,
    }))
  return {
    fields: [
      { fieldId: fields.Name, type: fieldTypes.Text, nullable: true },
      {
        fieldId: fields.Group,
        type: fieldTypes.Select,
        nullable: true,
        options: groupOptions,
      },
      { fieldId: fields.Unlimited, type: fieldTypes.Boolean },
      {
        fieldId: fields.Quota,
        type: fieldTypes.Number,
        min: 0,
        step: 1 / QUOTA_PER_USD,
      },
      {
        fieldId: fields.ExpiresAt,
        type: fieldTypes.DateTime,
        nullable: true,
      },
      {
        fieldId: fields.Models,
        type: fieldTypes.MultiSelect,
        options: models.map((model) => ({
          value: model,
          displayLabel: model,
        })),
      },
      { fieldId: fields.Subnet, type: fieldTypes.Textarea },
      {
        fieldId: fields.Rpm,
        type: fieldTypes.Number,
        min: 0,
        step: 1,
      },
    ],
    initialValues: {
      [fields.Name]:
        detail?.name ?? (nameHint?.trim() || DEFAULT_AUTO_PROVISION_KEY_NAME),
      [fields.Group]: detail?.grp || null,
      [fields.Unlimited]: detail ? detail.unlimited : true,
      [fields.Quota]: detail ? detail.remainQuota / QUOTA_PER_USD : 0,
      [fields.ExpiresAt]:
        detail && detail.expiredAt !== PMAPI_KEY_NEVER_EXPIRES
          ? new Date(detail.expiredAt * 1000).toISOString()
          : null,
      [fields.Models]: detail ? parseModelList(detail.models) : [],
      [fields.Subnet]: detail?.subnet ?? "",
      [fields.Rpm]: detail?.rpm ?? 0,
    },
    validate(values) {
      const issues: ResourceFieldIssue[] = []
      if (
        values[fields.Name] !== null &&
        typeof values[fields.Name] !== "string"
      )
        issues.push({ fieldId: fields.Name, code: issueCodes.InvalidValue })
      const group = values[fields.Group]
      if (group !== null && typeof group !== "string")
        issues.push({ fieldId: fields.Group, code: issueCodes.InvalidValue })
      else if (
        typeof group === "string" &&
        group &&
        !groups.some((known) => known.name === group)
      )
        issues.push({
          fieldId: fields.Group,
          code: issueCodes.UnsupportedOption,
        })
      if (typeof values[fields.Unlimited] !== "boolean")
        issues.push({
          fieldId: fields.Unlimited,
          code: issueCodes.InvalidValue,
        })
      if (
        values[fields.Unlimited] !== true &&
        (typeof values[fields.Quota] !== "number" ||
          !Number.isFinite(values[fields.Quota]) ||
          Math.round(Number(values[fields.Quota]) * QUOTA_PER_USD) <= 0)
      )
        issues.push({ fieldId: fields.Quota, code: issueCodes.OutOfRange })
      const expiresAt = values[fields.ExpiresAt]
      if (
        expiresAt !== null &&
        expiresAt !== undefined &&
        typeof expiresAt !== "string"
      )
        issues.push({
          fieldId: fields.ExpiresAt,
          code: issueCodes.InvalidValue,
        })
      const selected = values[fields.Models]
      if (
        selected !== undefined &&
        (!Array.isArray(selected) ||
          !selected.every(
            (model) => typeof model === "string" && models.includes(model),
          ))
      )
        issues.push({
          fieldId: fields.Models,
          code: issueCodes.UnsupportedOption,
        })
      if (
        values[fields.Subnet] !== undefined &&
        typeof values[fields.Subnet] !== "string"
      )
        issues.push({ fieldId: fields.Subnet, code: issueCodes.InvalidValue })
      const rpm = values[fields.Rpm]
      if (
        rpm !== undefined &&
        (typeof rpm !== "number" || !Number.isSafeInteger(rpm) || rpm < 0)
      )
        issues.push({ fieldId: fields.Rpm, code: issueCodes.OutOfRange })
      return issues.length ? { valid: false, issues } : { valid: true }
    },
    buildCommand(values): PmApiKeyInput {
      const expiresAt = values[fields.ExpiresAt]
      const rpm = Number(values[fields.Rpm] ?? 0)
      return {
        name: String(values[fields.Name] ?? "").trim(),
        grp: values[fields.Group] === null ? "" : String(values[fields.Group]),
        unlimited: values[fields.Unlimited] === true,
        remainQuota:
          values[fields.Unlimited] === true
            ? 0
            : Math.round(Number(values[fields.Quota]) * QUOTA_PER_USD),
        expiredAt:
          typeof expiresAt === "string" && expiresAt.trim()
            ? Math.floor(new Date(expiresAt).getTime() / 1000)
            : PMAPI_KEY_NEVER_EXPIRES,
        models: (Array.isArray(values[fields.Models])
          ? (values[fields.Models] as string[])
          : []
        )
          .filter((model) => models.includes(model))
          .join(","),
        subnet: String(values[fields.Subnet] ?? "").replace(/\s/g, ""),
        rpm: Number.isSafeInteger(rpm) && rpm > 0 ? rpm : 0,
      }
    },
  }
}

/**
 * Lifecycle actions reuse the console's own minimal writes: rotate calls the
 * regenerate route, enable/disable send only `{status}`.
 */
export function editPmApiKeyEditor(
  detail: PmApiKey & {
    editorGroups?: readonly PmApiTokenGroup[]
    editorModels?: readonly string[]
  },
  intent?: AccountKeyResourceEditIntent,
): AccountKeyResourceEditorDefinition<PmApiKeyEditCommand> {
  const action = intent?.action
  if (
    action === editActions.Rotate ||
    action === editActions.Enable ||
    action === editActions.Disable
  ) {
    return {
      action,
      fields: [],
      initialValues: {},
      validate: () => ({ valid: true }),
      buildCommand: () => ({
        rotate: action === editActions.Rotate,
        payload:
          action === editActions.Rotate
            ? {}
            : {
                status:
                  action === editActions.Enable
                    ? PMAPI_KEY_STATUSES.Enabled
                    : PMAPI_KEY_STATUSES.Disabled,
              },
      }),
    }
  }
  const editorGroups = detail.editorGroups ?? []
  const known = new Map(editorGroups.map((group) => [group.name, group]))
  const groups = [
    ...(detail.grp && !known.has(detail.grp)
      ? [{ name: detail.grp, ratio: 1 }]
      : []),
    ...editorGroups,
  ]
  const models = [
    ...new Set([
      ...(detail.editorModels ?? []),
      ...(detail.models ? detail.models.split(",") : []),
    ]),
  ]
  const editor = createPmApiKeyEditor({ groups, models, detail })
  const buildCommand = editor.buildCommand
  return {
    fields: editor.fields,
    initialValues: editor.initialValues,
    validate: editor.validate,
    buildCommand: (values) => ({
      rotate: false,
      payload: buildCommand(values),
    }),
  }
}
