import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/accountKeyNames"
import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/factory"
import type { AccountKeyCreationIntent } from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  RESOURCE_FIELD_TYPES,
  type ResourceFieldDescriptor,
  type ResourceFieldIssue,
} from "~/services/apiAdapters/contracts/resourceNative"
import {
  GRSAI_KEY_TYPE_LIMITED,
  GRSAI_NO_EXPIRY,
} from "~/services/apiService/grsai/constants"
import { toOptionalFiniteNumber } from "~/services/apiService/grsai/parsing"
import type { GrsaiApiKey } from "~/services/apiService/grsai/type"

export const GRSAI_KEY_FIELD_IDS = {
  Name: "name",
  Unlimited: "unlimited_credits",
  Credits: "credits",
  ExpiresAt: "expires_at",
} as const

const field = GRSAI_KEY_FIELD_IDS

/**
 * Provider-shaped key state used for drift detection between the form's
 * baseline and the submitted values.
 *
 * The deployment has no other per-key knobs: a key is a name, a credit budget
 * (or none) and an optional expiry.
 */
export type GrsaiKeySnapshot = {
  name: string
  unlimited: boolean
  /** Remaining budget of a limited key; carried unchanged for unlimited ones. */
  credits: number
  expiresAt: string | null
}

export type GrsaiKeyEditCommand = {
  baseline: GrsaiKeySnapshot
  values: GrsaiKeySnapshot
}

const asString = (value: unknown): string =>
  typeof value === "string" ? value : ""

/** Stored expiry (unix seconds, `0` meaning never) as an ISO editor value. */
const toEditorExpiry = (expireTime: unknown): string | null => {
  const seconds = toOptionalFiniteNumber(expireTime)
  if (seconds === undefined || seconds <= GRSAI_NO_EXPIRY) return null
  return new Date(seconds * 1000).toISOString()
}

/** Editor value back to the wire's unix seconds; `0` clears the expiry. */
export const toGrsaiExpireTime = (value: string | null): number => {
  if (!value) return GRSAI_NO_EXPIRY
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp)
    ? Math.floor(timestamp / 1000)
    : GRSAI_NO_EXPIRY
}

export const toGrsaiKeySnapshot = (key: GrsaiApiKey): GrsaiKeySnapshot => ({
  name: key.name?.trim() ?? "",
  unlimited: key.type !== GRSAI_KEY_TYPE_LIMITED,
  credits: toOptionalFiniteNumber(key.credits) ?? 0,
  expiresAt: toEditorExpiry(key.expireTime),
})

/**
 * Key editor for Grsai.
 *
 * A key is unlimited or carries a remaining credit budget; the deployment
 * reports the budget as `credits` and ignores it while the key is unlimited.
 * Expiry is always clearable because `expireTime: 0` means "never".
 */
export function createGrsaiKeyEditor(params: {
  key?: GrsaiApiKey
  intent?: AccountKeyCreationIntent
}): AccountKeyResourceEditorDefinition<GrsaiKeyEditCommand> {
  const { key, intent } = params
  const baseline: GrsaiKeySnapshot = key
    ? toGrsaiKeySnapshot(key)
    : {
        name: intent?.nameHint?.trim() || DEFAULT_AUTO_PROVISION_KEY_NAME,
        unlimited: true,
        credits: 0,
        expiresAt: null,
      }

  const fields: ResourceFieldDescriptor[] = [
    { fieldId: field.Name, type: RESOURCE_FIELD_TYPES.Text, required: true },
    { fieldId: field.Unlimited, type: RESOURCE_FIELD_TYPES.Boolean },
    { fieldId: field.Credits, type: RESOURCE_FIELD_TYPES.Number, min: 0 },
    {
      fieldId: field.ExpiresAt,
      type: RESOURCE_FIELD_TYPES.DateTime,
      nullable: true,
    },
  ]

  return {
    fields,
    initialValues: {
      [field.Name]: baseline.name,
      [field.Unlimited]: baseline.unlimited,
      [field.Credits]: baseline.credits,
      [field.ExpiresAt]: baseline.expiresAt ?? "",
    },
    validate(values) {
      const issues: ResourceFieldIssue[] = []

      if (!asString(values[field.Name]).trim()) {
        issues.push({ fieldId: field.Name, code: "required" })
      }

      if (values[field.Unlimited] !== true) {
        const credits = values[field.Credits]
        // An exhausted limited key legitimately reports a zero budget, so the
        // bound is inclusivity, not a positive minimum.
        if (
          typeof credits !== "number" ||
          !Number.isFinite(credits) ||
          credits < 0
        ) {
          issues.push({ fieldId: field.Credits, code: "out_of_range" })
        }
      }

      const expiry = asString(values[field.ExpiresAt]).trim()
      if (expiry && !Number.isFinite(Date.parse(expiry))) {
        issues.push({ fieldId: field.ExpiresAt, code: "invalid_value" })
      }

      return issues.length ? { valid: false, issues } : { valid: true }
    },
    buildCommand(values) {
      const unlimited = values[field.Unlimited] === true
      const credits = values[field.Credits]
      const expiry = asString(values[field.ExpiresAt]).trim()

      return {
        baseline,
        values: {
          name: asString(values[field.Name]).trim(),
          unlimited,
          credits: unlimited || typeof credits !== "number" ? 0 : credits,
          expiresAt: expiry ? new Date(expiry).toISOString() : null,
        },
      }
    },
  }
}
