import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/keys/accountKeyNames"
import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/definition"
import {
  RESOURCE_FIELD_TYPES as fieldTypes,
  RESOURCE_FIELD_ISSUE_CODES as issueCodes,
} from "~/services/apiAdapters/contracts/resourceNative"
import type { ResourceFieldIssue } from "~/services/apiAdapters/contracts/resourceNative"
import {
  AIMLAPI_KEY_EDITOR_LIMITS,
  AIMLAPI_KEY_LIMIT_PERIODS,
  AIMLAPI_KEY_LIMIT_RETENTIONS,
  AIMLAPI_KEY_SCOPES,
  type AimlApiKeyLimitRetention,
  type AimlApiKeyScope,
} from "~/services/apiService/aimlapi/constants"
import type { AimlApiKey } from "~/services/apiService/aimlapi/keys"
import { fetchAimlApiModelCatalog } from "~/services/apiService/aimlapi/models"
import { fetchAimlApiTools } from "~/services/apiService/aimlapi/tools"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

import {
  AIMLAPI_KEY_LIMIT_MODES,
  AIMLAPI_KEY_EDITOR_FIELDS as fields,
} from "./keyResourceFields"

/** Wire command shared by create and edit; `expiresAt` is create-only. */
export type AimlApiKeyCommand = {
  name: string
  scopes: readonly AimlApiKeyScope[] | null
  limit: { retention: AimlApiKeyLimitRetention; thresholdUsd: number } | null
  allowedModels: readonly string[] | null
  allowedTools: readonly string[] | null
  /** Create only: the update route ignores this field. */
  expiresAt?: string | null
  /** Edit only: enable or disable the key. */
  disabled?: boolean
}

/** Immediate lifecycle actions change only the native disabled flag. */
export type AimlApiKeyStatusCommand = { disabled: boolean }
const knownScopes = new Set<string>(AIMLAPI_KEY_SCOPES)
const knownRetentions = new Set<string>(AIMLAPI_KEY_LIMIT_RETENTIONS)

const parseRestrictionList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : typeof value === "string"
      ? value
          .split(/[,\n]/)
          .map((entry) => entry.trim())
          .filter(Boolean)
      : []

/** Empty restrictions use the provider's explicit unrestricted value. */
const restrictionOrNull = (value: unknown): string[] | null => {
  const entries = parseRestrictionList(value)
  return entries.length ? entries : null
}

const scopeOptions = AIMLAPI_KEY_SCOPES.map((scope) => ({
  value: scope,
}))

const retentionOptions = AIMLAPI_KEY_LIMIT_RETENTIONS.map((retention) => ({
  value: retention,
}))

/**
 * Native key form.
 *
 * The dashboard offers a name, USD spend limit with a reset period, model
 * scopes, an expiry and an allowed-model list. `expires_at` cannot be changed
 * after creation (the PATCH route ignores it), so edit mode shows it read-only
 * instead of pretending a submitted change would apply.
 */
export function createAimlApiKeyEditor(params: {
  detail?: AimlApiKey
  nameHint?: string
  request?: ApiServiceRequest
}): Omit<
  AccountKeyResourceEditorDefinition<AimlApiKeyCommand>,
  "destinationScopeKey"
> {
  const { detail, nameHint } = params
  const isEdit = detail !== undefined
  const limit = detail?.limit ?? null

  return {
    fields: [
      { fieldId: fields.Name, type: fieldTypes.Text, required: true },
      {
        fieldId: fields.Scopes,
        type: fieldTypes.MultiSelect,
        options: scopeOptions,
        nullable: true,
      },
      {
        fieldId: fields.LimitMode,
        type: fieldTypes.Select,
        options: [
          {
            value: AIMLAPI_KEY_LIMIT_MODES.Unlimited,
          },
          {
            value: AIMLAPI_KEY_LIMIT_MODES.Limited,
          },
        ],
      },
      {
        fieldId: fields.LimitAmount,
        type: fieldTypes.Number,
        min: 0,
        step: 0.01,
        nullable: true,
      },
      {
        fieldId: fields.LimitRetention,
        type: fieldTypes.Select,
        options: retentionOptions,
      },
      {
        fieldId: fields.AllowedModels,
        type: fieldTypes.MultiSelect,
        options: (detail?.allowedModels ?? []).map((value) => ({
          value,
          displayLabel: value,
        })),
        allowCustom: true,
        optionLoader: { dependsOn: [] },
        nullable: true,
      },
      {
        fieldId: fields.AllowedTools,
        type: fieldTypes.MultiSelect,
        options: (detail?.allowedTools ?? []).map((value) => ({
          value,
          displayLabel: value,
        })),
        allowCustom: true,
        optionLoader: { dependsOn: [] },
        nullable: true,
      },
      {
        fieldId: fields.ExpiresAt,
        type: fieldTypes.DateTime,
        nullable: true,
        ...(isEdit ? { readOnly: true } : {}),
      },
      ...(isEdit
        ? [{ fieldId: fields.Enabled, type: fieldTypes.Boolean }]
        : []),
    ],
    initialValues: {
      [fields.Name]:
        detail?.name ?? (nameHint?.trim() || DEFAULT_AUTO_PROVISION_KEY_NAME),
      [fields.Scopes]: detail?.scopes ? [...detail.scopes] : null,
      [fields.LimitMode]:
        limit === null
          ? AIMLAPI_KEY_LIMIT_MODES.Unlimited
          : AIMLAPI_KEY_LIMIT_MODES.Limited,
      [fields.LimitAmount]: limit?.thresholdUsd ?? null,
      [fields.LimitRetention]:
        limit?.retention ?? AIMLAPI_KEY_LIMIT_PERIODS.Never,
      [fields.AllowedModels]: detail?.allowedModels
        ? [...detail.allowedModels]
        : [],
      [fields.AllowedTools]: detail?.allowedTools
        ? [...detail.allowedTools]
        : [],
      [fields.ExpiresAt]: detail?.expiresAt ?? null,
      [fields.Enabled]: detail ? !detail.disabled : true,
    },
    async loadOptions(fieldId, _values, options) {
      if (fieldId === fields.AllowedTools) {
        const tools = new Map(
          (detail?.allowedTools ?? []).map((value) => [
            value,
            { value, displayLabel: value },
          ]),
        )
        for (const tool of await fetchAimlApiTools(options?.signal))
          tools.set(tool.value, tool)
        return [...tools.values()]
      }
      if (fieldId !== fields.AllowedModels || !params.request) return []
      const models = await fetchAimlApiModelCatalog({
        ...params.request,
        abortSignal: options?.signal,
      })
      const choices = new Map(
        (detail?.allowedModels ?? []).map((value) => [
          value,
          { value, displayLabel: value },
        ]),
      )
      for (const model of models)
        choices.set(model.id, {
          value: model.id,
          displayLabel:
            model.info.name && model.info.name !== model.id
              ? `${model.info.name} (${model.id})`
              : model.id,
        })
      return [...choices.values()]
    },
    validate(values) {
      const issues: ResourceFieldIssue[] = []
      for (const [fieldId, maximum] of [
        [fields.AllowedModels, AIMLAPI_KEY_EDITOR_LIMITS.AllowedModels],
        [fields.AllowedTools, AIMLAPI_KEY_EDITOR_LIMITS.AllowedTools],
      ] as const) {
        if (parseRestrictionList(values[fieldId]).length > maximum)
          issues.push({ fieldId, code: issueCodes.OutOfRange })
      }
      const name = values[fields.Name]
      if (typeof name !== "string" || !name.trim())
        issues.push({ fieldId: fields.Name, code: issueCodes.Required })
      else if (name.trim().length > AIMLAPI_KEY_EDITOR_LIMITS.Name)
        issues.push({ fieldId: fields.Name, code: issueCodes.OutOfRange })

      const scopes = values[fields.Scopes]
      if (scopes !== null && scopes !== undefined) {
        if (!Array.isArray(scopes)) {
          issues.push({ fieldId: fields.Scopes, code: issueCodes.InvalidValue })
        } else {
          for (const scope of scopes) {
            if (typeof scope !== "string" || !knownScopes.has(scope))
              issues.push({
                fieldId: fields.Scopes,
                code: issueCodes.UnsupportedOption,
              })
          }
        }
      }

      const limitMode = values[fields.LimitMode]
      if (
        limitMode !== AIMLAPI_KEY_LIMIT_MODES.Unlimited &&
        limitMode !== AIMLAPI_KEY_LIMIT_MODES.Limited
      ) {
        issues.push({
          fieldId: fields.LimitMode,
          code: issueCodes.InvalidValue,
        })
      } else if (limitMode === AIMLAPI_KEY_LIMIT_MODES.Limited) {
        const amount = values[fields.LimitAmount]
        if (
          typeof amount !== "number" ||
          !Number.isFinite(amount) ||
          Math.round(amount * 100) <= 0
        )
          issues.push({
            fieldId: fields.LimitAmount,
            code: issueCodes.OutOfRange,
          })
        const retention = values[fields.LimitRetention]
        if (typeof retention !== "string" || !knownRetentions.has(retention))
          issues.push({
            fieldId: fields.LimitRetention,
            code: issueCodes.UnsupportedOption,
          })
      }

      const expiresAt = values[fields.ExpiresAt]
      if (
        !isEdit &&
        expiresAt !== null &&
        expiresAt !== undefined &&
        (typeof expiresAt !== "string" ||
          !Number.isFinite(Date.parse(expiresAt)))
      )
        issues.push({
          fieldId: fields.ExpiresAt,
          code: issueCodes.InvalidValue,
        })

      if (isEdit && typeof values[fields.Enabled] !== "boolean")
        issues.push({ fieldId: fields.Enabled, code: issueCodes.InvalidValue })

      return issues.length ? { valid: false, issues } : { valid: true }
    },
    buildCommand(values) {
      const limitMode = values[fields.LimitMode]
      const retention = values[fields.LimitRetention]
      const scopes = values[fields.Scopes]
      const expiresAt = values[fields.ExpiresAt]
      return {
        name: String(values[fields.Name] ?? "").trim(),
        scopes: Array.isArray(scopes) ? (scopes as AimlApiKeyScope[]) : null,
        limit:
          limitMode === AIMLAPI_KEY_LIMIT_MODES.Limited
            ? {
                retention: retention as AimlApiKeyLimitRetention,
                thresholdUsd:
                  Math.round(Number(values[fields.LimitAmount]) * 100) / 100,
              }
            : null,
        allowedModels: restrictionOrNull(values[fields.AllowedModels]),
        allowedTools: restrictionOrNull(values[fields.AllowedTools]),
        ...(!isEdit
          ? {
              expiresAt:
                typeof expiresAt === "string" && expiresAt.trim()
                  ? new Date(expiresAt).toISOString()
                  : null,
            }
          : { disabled: values[fields.Enabled] === false }),
      }
    },
  }
}
