import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/keys/accountKeyNames"
import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/definition"
import type { AccountKeyCreationIntent } from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  RESOURCE_FIELD_ISSUE_CODES,
  RESOURCE_FIELD_TYPES,
  type ResourceFieldDescriptor,
  type ResourceFieldIssue,
} from "~/services/apiAdapters/contracts/resourceNative"
import { EMRANK_TOKENS_PER_M_TOKEN } from "~/services/apiService/emrank/constants"
import type { EmRankKeyExpiration } from "~/services/apiService/emrank/keys"

import { EMRANK_EXPIRATION_MODES, emrankKeyFields } from "./keyResourceFields"

export { EMRANK_EXPIRATION_MODES } from "./keyResourceFields"

export type EmRankExpirationMode =
  (typeof EMRANK_EXPIRATION_MODES)[keyof typeof EMRANK_EXPIRATION_MODES]

const expirationModes: readonly string[] = Object.values(
  EMRANK_EXPIRATION_MODES,
)

export type EmRankKeyCommand = {
  name: string
  unlimited: boolean
  /** M Token, the console's own input unit (1 M = 1,000,000 Token). */
  quota: number
  expirationMode: EmRankExpirationMode
  /** Required only when `expirationMode` is `custom`, in epoch seconds. */
  expiresAt?: number
  enabled?: boolean
}

/** DateTime projections arrive as ISO strings; the console stores epoch seconds. */
const toEpochSeconds = (value: unknown): number | undefined => {
  if (typeof value !== "string" || !value.trim()) return undefined
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : undefined
}

/** M Token accepts up to six decimals, matching the console's own validator. */
const M_TOKEN_PATTERN = /^\d+(\.\d{1,6})?$/
const MIN_M_TOKEN_QUOTA = 1 / EMRANK_TOKENS_PER_M_TOKEN

const modeOptions = (editing: boolean) =>
  expirationModes
    .filter((value) => editing || value !== EMRANK_EXPIRATION_MODES.Keep)
    .map((value) => ({ value }))

/**
 * The native create dialog: required name, unlimited quota by default and
 * "never" expiry by default; edit adds "keep", the enabled switch and a
 * custom timestamp when that mode is selected.
 */
export function createEmRankKeyEditor(
  key?: {
    name: string
    totalQuota: number | null
    expiresAt: number | null
    enabled: boolean
  },
  intent?: AccountKeyCreationIntent,
): AccountKeyResourceEditorDefinition<EmRankKeyCommand> {
  const editing = key !== undefined
  const fields: ResourceFieldDescriptor[] = [
    {
      fieldId: emrankKeyFields.Name,
      type: RESOURCE_FIELD_TYPES.Text,
      required: true,
    },
    {
      fieldId: emrankKeyFields.Unlimited,
      type: RESOURCE_FIELD_TYPES.Boolean,
    },
    {
      fieldId: emrankKeyFields.Quota,
      type: RESOURCE_FIELD_TYPES.Number,
      min: MIN_M_TOKEN_QUOTA,
      step: MIN_M_TOKEN_QUOTA,
    },
    {
      fieldId: emrankKeyFields.ExpirationMode,
      type: RESOURCE_FIELD_TYPES.Select,
      options: modeOptions(editing),
    },
    {
      fieldId: emrankKeyFields.ExpiresAt,
      type: RESOURCE_FIELD_TYPES.DateTime,
      nullable: true,
    },
    ...(editing
      ? [
          {
            fieldId: emrankKeyFields.Enabled,
            type: RESOURCE_FIELD_TYPES.Boolean,
          },
        ]
      : []),
  ]
  return {
    fields,
    initialValues: {
      [emrankKeyFields.Name]: editing
        ? key.name
        : intent?.nameHint?.trim() || DEFAULT_AUTO_PROVISION_KEY_NAME,
      [emrankKeyFields.Unlimited]: key ? key.totalQuota === null : true,
      [emrankKeyFields.Quota]:
        key && key.totalQuota !== null
          ? key.totalQuota / EMRANK_TOKENS_PER_M_TOKEN
          : 10,
      [emrankKeyFields.ExpirationMode]: editing
        ? EMRANK_EXPIRATION_MODES.Keep
        : EMRANK_EXPIRATION_MODES.Never,
      [emrankKeyFields.ExpiresAt]:
        key && key.expiresAt !== null
          ? new Date(key.expiresAt * 1000).toISOString()
          : null,
      ...(editing ? { [emrankKeyFields.Enabled]: key.enabled } : {}),
    },
    validate(values) {
      const issues: ResourceFieldIssue[] = []
      const name = values[emrankKeyFields.Name]
      if (typeof name !== "string" || !name.trim())
        issues.push({
          fieldId: emrankKeyFields.Name,
          code: RESOURCE_FIELD_ISSUE_CODES.Required,
        })
      const unlimited = values[emrankKeyFields.Unlimited] === true
      const quota = values[emrankKeyFields.Quota]
      if (
        !unlimited &&
        (typeof quota !== "number" ||
          !M_TOKEN_PATTERN.test(String(quota)) ||
          quota <= 0)
      )
        issues.push({
          fieldId: emrankKeyFields.Quota,
          code: RESOURCE_FIELD_ISSUE_CODES.OutOfRange,
        })
      const mode = values[emrankKeyFields.ExpirationMode]
      if (typeof mode !== "string" || !expirationModes.includes(mode))
        issues.push({
          fieldId: emrankKeyFields.ExpirationMode,
          code: RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
        })
      const expiresAt = values[emrankKeyFields.ExpiresAt]
      if (mode === EMRANK_EXPIRATION_MODES.Custom) {
        const timestamp = toEpochSeconds(expiresAt)
        if (timestamp === undefined)
          issues.push({
            fieldId: emrankKeyFields.ExpiresAt,
            code: RESOURCE_FIELD_ISSUE_CODES.Required,
          })
        else if (timestamp * 1000 <= Date.now())
          issues.push({
            fieldId: emrankKeyFields.ExpiresAt,
            code: RESOURCE_FIELD_ISSUE_CODES.OutOfRange,
          })
      }
      return issues.length ? { valid: false, issues } : { valid: true }
    },
    buildCommand: (values) => {
      const mode = values[
        emrankKeyFields.ExpirationMode
      ] as EmRankExpirationMode
      const unlimited = values[emrankKeyFields.Unlimited] === true
      const command: EmRankKeyCommand = {
        name: String(values[emrankKeyFields.Name]).trim(),
        unlimited,
        quota: unlimited ? 0 : Number(values[emrankKeyFields.Quota] ?? 0),
        expirationMode: mode,
        ...(editing
          ? { enabled: values[emrankKeyFields.Enabled] !== false }
          : {}),
        ...(mode === EMRANK_EXPIRATION_MODES.Custom
          ? { expiresAt: toEpochSeconds(values[emrankKeyFields.ExpiresAt]) }
          : {}),
      }
      return command
    },
  }
}

/** Map the editor command onto the native create/update payload. */
export function toExpiration(
  command: EmRankKeyCommand,
): EmRankKeyExpiration | undefined {
  switch (command.expirationMode) {
    case EMRANK_EXPIRATION_MODES.Keep:
      return undefined
    case EMRANK_EXPIRATION_MODES.Custom:
      return command.expiresAt === undefined
        ? undefined
        : { mode: EMRANK_EXPIRATION_MODES.Custom, at: command.expiresAt }
    default:
      return { mode: command.expirationMode }
  }
}
