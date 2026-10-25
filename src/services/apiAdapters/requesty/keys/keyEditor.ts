import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/keys/accountKeyNames"
import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/definition"
import {
  RESOURCE_FIELD_ISSUE_CODES,
  RESOURCE_FIELD_TYPES,
  type EditableResourceProjection,
  type ResourceValidationResult,
} from "~/services/apiAdapters/contracts/resourceNative"
import type {
  RequestyApiKey,
  RequestyCreateKeyInput,
} from "~/services/apiService/requesty"

import { REQUESTY_KEY_FIELDS } from "./keyResourceFields"

export type RequestyCreateKeyCommand = RequestyCreateKeyInput

/**
 * Updates are split across dedicated endpoints; undefined fields keep their
 * current values and an empty string clears the expiry.
 */
export type RequestyUpdateKeyCommand = {
  monthlyLimit?: number
  expiresAt?: string
}

const readString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

const readNumber = (value: unknown): number | undefined => {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

const readBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback

const validateLimitAndExpiry = (
  values: EditableResourceProjection,
): ResourceValidationResult => {
  const limit = readNumber(values[REQUESTY_KEY_FIELDS.MonthlyLimit])
  const expiry = readString(values[REQUESTY_KEY_FIELDS.ExpiresAt])
  const issues: {
    fieldId: string
    code: typeof RESOURCE_FIELD_ISSUE_CODES.InvalidValue
  }[] = []
  if (values[REQUESTY_KEY_FIELDS.MonthlyLimit] !== "" && limit === undefined) {
    issues.push({
      fieldId: REQUESTY_KEY_FIELDS.MonthlyLimit,
      code: RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  if (expiry && !Number.isFinite(new Date(expiry).getTime())) {
    issues.push({
      fieldId: REQUESTY_KEY_FIELDS.ExpiresAt,
      code: RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  return issues.length ? { valid: false, issues } : { valid: true }
}

const validateCreateKeyValues = (
  values: EditableResourceProjection,
): ResourceValidationResult => {
  const name = readString(values[REQUESTY_KEY_FIELDS.Name])
  if (!name) {
    return {
      valid: false,
      issues: [
        {
          fieldId: REQUESTY_KEY_FIELDS.Name,
          code: RESOURCE_FIELD_ISSUE_CODES.Required,
        },
      ],
    }
  }
  return validateLimitAndExpiry(values)
}

/** Creation supports a name, monthly cap and management permission. */
export function createRequestyKeyEditor(
  nameHint?: string,
): AccountKeyResourceEditorDefinition<RequestyCreateKeyCommand> {
  return {
    fields: [
      {
        fieldId: REQUESTY_KEY_FIELDS.Name,
        type: RESOURCE_FIELD_TYPES.Text,
        required: true,
      },
      {
        fieldId: REQUESTY_KEY_FIELDS.MonthlyLimit,
        type: RESOURCE_FIELD_TYPES.Number,
        min: 0,
        step: 0.01,
      },
      {
        fieldId: REQUESTY_KEY_FIELDS.ManagePermission,
        type: RESOURCE_FIELD_TYPES.Boolean,
      },
    ],
    initialValues: {
      [REQUESTY_KEY_FIELDS.Name]:
        nameHint?.trim() || DEFAULT_AUTO_PROVISION_KEY_NAME,
      [REQUESTY_KEY_FIELDS.MonthlyLimit]: "",
      [REQUESTY_KEY_FIELDS.ManagePermission]: false,
    },
    validate: validateCreateKeyValues,
    buildCommand: (values) => {
      const monthlyLimit = readNumber(values[REQUESTY_KEY_FIELDS.MonthlyLimit])
      return {
        name: readString(values[REQUESTY_KEY_FIELDS.Name]),
        ...(monthlyLimit !== undefined ? { monthlyLimit } : {}),
        managePermission: readBoolean(
          values[REQUESTY_KEY_FIELDS.ManagePermission],
          false,
        ),
      }
    },
  }
}

/**
 * Edit fields: Requesty has no name-update endpoint, so only the monthly
 * limit and expiry are editable.
 */
export function editRequestyKeyEditor(
  detail: RequestyApiKey,
): AccountKeyResourceEditorDefinition<RequestyUpdateKeyCommand> {
  return {
    fields: [
      {
        fieldId: REQUESTY_KEY_FIELDS.MonthlyLimit,
        type: RESOURCE_FIELD_TYPES.Number,
        min: 0,
        step: 0.01,
      },
      {
        fieldId: REQUESTY_KEY_FIELDS.ExpiresAt,
        type: RESOURCE_FIELD_TYPES.DateTime,
        nullable: true,
      },
    ],
    initialValues: {
      [REQUESTY_KEY_FIELDS.MonthlyLimit]: detail.monthlyLimit,
      [REQUESTY_KEY_FIELDS.ExpiresAt]: detail.expiresAt ?? "",
    },
    // The name is not editable and is absent from edit values; validating it
    // would fail every edit submit on an unrendered field.
    validate: validateLimitAndExpiry,
    buildCommand: (values) => {
      const command: RequestyUpdateKeyCommand = {}
      const limit = readNumber(values[REQUESTY_KEY_FIELDS.MonthlyLimit])
      if (limit !== undefined && limit !== detail.monthlyLimit) {
        command.monthlyLimit = limit
      }
      const expiry = readString(values[REQUESTY_KEY_FIELDS.ExpiresAt])
      if (expiry) {
        // An untouched field restores the raw provider value, so compare
        // instants rather than ISO strings: fractional seconds or an equivalent
        // format must not read as an edit that calls the expiry endpoint.
        const next = new Date(expiry)
        const current = detail.expiresAt
          ? new Date(detail.expiresAt).getTime()
          : null
        if (next.getTime() !== current) command.expiresAt = next.toISOString()
      } else if (detail.expiresAt) {
        command.expiresAt = ""
      }
      return command
    },
  }
}
