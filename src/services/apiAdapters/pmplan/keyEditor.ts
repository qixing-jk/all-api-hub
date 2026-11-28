import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/definition"
import {
  RESOURCE_FIELD_ISSUE_CODES as issues,
  RESOURCE_FIELD_TYPES,
} from "~/services/apiAdapters/contracts/resourceNative"
import type { ResourceFieldIssue } from "~/services/apiAdapters/contracts/resourceNative"
import type {
  PmplanKey,
  PmplanKeyInput,
  PmplanKeyModelInput,
} from "~/services/apiService/pmplan/keys"

import {
  PMPLAN_KEY_EXPIRY_PRESETS as expiryPresets,
  PMPLAN_KEY_EDITOR_FIELDS as fields,
  PMPLAN_KEY_MODEL_UPDATE_LIMIT,
} from "./keyResourceFields"

const MILLISECONDS_PER_DAY = 86_400_000
const expiryOptions: readonly string[] = Object.values(expiryPresets)
const acceptsModels = (
  value: unknown,
  models: readonly string[],
): value is string[] =>
  Array.isArray(value) &&
  value.every((model) => typeof model === "string" && models.includes(model))

/** Existing keys expose only the model restriction route; clearing follows future account models. */
export function editPmplanKeyEditor(
  key: PmplanKey,
  models: readonly string[],
): AccountKeyResourceEditorDefinition<PmplanKeyModelInput> {
  return {
    fields: [
      {
        fieldId: fields.Models,
        type: RESOURCE_FIELD_TYPES.MultiSelect,
        options: [...new Set([...models, ...key.models])].map((value) => ({
          value,
          displayLabel: value,
        })),
      },
    ],
    initialValues: { models: key.all_models ? [] : key.models },
    validate(values) {
      return acceptsModels(values.models, models) &&
        values.models.length <= PMPLAN_KEY_MODEL_UPDATE_LIMIT
        ? { valid: true }
        : {
            valid: false,
            issues: [
              { fieldId: fields.Models, code: issues.UnsupportedOption },
            ],
          }
    },
    buildCommand: (values) => ({ models: values.models as string[] }),
  }
}

/** Native creation only sets expiry and model restrictions; empty models follow the account dynamically. */
export function createPmplanKeyEditor(
  models: readonly string[],
): AccountKeyResourceEditorDefinition<PmplanKeyInput> {
  return {
    fields: [
      {
        fieldId: fields.Expiry,
        type: RESOURCE_FIELD_TYPES.Select,
        options: expiryOptions.map((value) => ({
          value,
        })),
      },
      {
        fieldId: fields.ExpiresAt,
        type: RESOURCE_FIELD_TYPES.DateTime,
        nullable: false,
      },
      {
        fieldId: fields.Models,
        type: RESOURCE_FIELD_TYPES.MultiSelect,
        options: models.map((value) => ({ value, displayLabel: value })),
      },
    ],
    initialValues: {
      // Follow the extension's persistent-key default; timed expiry stays optional.
      expiry: expiryPresets.Never,
      expiresAt: new Date(Date.now() + 30 * MILLISECONDS_PER_DAY).toISOString(),
      models: [],
    },
    validate(values) {
      const found: ResourceFieldIssue[] = []
      if (
        typeof values.expiry !== "string" ||
        !expiryOptions.includes(values.expiry)
      )
        found.push({ fieldId: fields.Expiry, code: issues.UnsupportedOption })
      const expiry = values.expiresAt
      if (
        values.expiry === expiryPresets.Custom &&
        (expiry === null ||
          typeof expiry !== "string" ||
          !Number.isFinite(Date.parse(expiry)) ||
          Date.parse(expiry) <= Date.now())
      )
        found.push({ fieldId: fields.ExpiresAt, code: issues.InvalidValue })
      if (!acceptsModels(values.models, models))
        found.push({ fieldId: fields.Models, code: issues.UnsupportedOption })
      return found.length ? { valid: false, issues: found } : { valid: true }
    },
    buildCommand(values) {
      return {
        expires_at:
          values.expiry === expiryPresets.Never
            ? null
            : values.expiry === expiryPresets.Custom
              ? new Date(values.expiresAt as string).toISOString()
              : new Date(
                  Date.now() + Number(values.expiry) * MILLISECONDS_PER_DAY,
                ).toISOString(),
        models: values.models as string[],
      }
    },
  }
}
