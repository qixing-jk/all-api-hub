import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/keys/accountKeyNames"
import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/definition"
import type { AccountKeyCreationIntent } from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  RESOURCE_FIELD_TYPES as fieldTypes,
  RESOURCE_FIELD_ISSUE_CODES as issueCodes,
} from "~/services/apiAdapters/contracts/resourceNative"
import type {
  ResourceFieldIssue,
  ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/resourceNative"
import { FOXCODE_UNITS_PER_USD } from "~/services/apiService/foxcode"
import type { FoxCodeChannel } from "~/services/apiService/foxcode/catalog"
import { FOXCODE_UNLIMITED_QUOTA } from "~/services/apiService/foxcode/constants"
import type {
  FoxCodeKey,
  FoxCodeKeyUpdate,
} from "~/services/apiService/foxcode/keys"

import { FOXCODE_KEY_EDITOR_FIELDS as fields } from "./keyEditorFields"

/** Native defaults: required channel, optional description, unlimited quota; status is editable separately. */
export function createFoxCodeKeyEditor(
  loadChannels: (
    options?: ResourceOperationOptions,
  ) => Promise<FoxCodeChannel[]>,
  key?: FoxCodeKey,
  intent?: AccountKeyCreationIntent,
): AccountKeyResourceEditorDefinition<FoxCodeKeyUpdate> {
  let channels: FoxCodeChannel[] = []
  let generation = 0
  return {
    fields: [
      { fieldId: fields.Name, type: fieldTypes.Text, required: true },
      { fieldId: fields.Description, type: fieldTypes.Textarea },
      {
        fieldId: fields.Channel,
        type: fieldTypes.Select,
        required: key?.channelKey !== null,
        nullable: key?.channelKey === null,
        options: [],
        optionLoader: { dependsOn: [] },
      },
      { fieldId: fields.Unlimited, type: fieldTypes.Boolean },
      {
        fieldId: fields.Quota,
        type: fieldTypes.Number,
        min: 0,
        step: 1 / FOXCODE_UNITS_PER_USD,
      },
      ...(key ? [{ fieldId: fields.Enabled, type: fieldTypes.Boolean }] : []),
    ],
    initialValues: {
      name:
        key?.name ??
        (intent?.nameHint?.trim() || DEFAULT_AUTO_PROVISION_KEY_NAME),
      description: key?.description ?? "",
      channelKey: key ? key.channelKey : intent?.preferredGroup ?? "",
      unlimited: !key || key.quotaLimit === FOXCODE_UNLIMITED_QUOTA,
      quotaUsd:
        key && key.quotaLimit !== FOXCODE_UNLIMITED_QUOTA
          ? key.quotaLimit / FOXCODE_UNITS_PER_USD
          : 0,
      enabled: key?.isActive ?? true,
    },
    async loadOptions(fieldId, _values, options) {
      if (fieldId !== fields.Channel) return []
      const current = ++generation
      channels = []
      const loaded = (await loadChannels(options)).filter(
        (channel) =>
          (channel.enabled || channel.key === key?.channelKey) &&
          (key ||
            intent?.allowedGroups === undefined ||
            intent.allowedGroups.includes(channel.key)) &&
          (key ||
            !intent?.modelContext ||
            channel.models.includes(intent.modelContext.modelId)),
      )
      options?.signal?.throwIfAborted()
      if (current === generation) channels = loaded
      const result = loaded.map((channel) => ({
        value: channel.key,
        displayLabel: channel.name,
      }))
      if (
        key?.channelKey &&
        !result.some((option) => option.value === key.channelKey)
      )
        result.push({ value: key.channelKey, displayLabel: key.channelKey })
      return result
    },
    validate(values) {
      const issues: ResourceFieldIssue[] = []
      if (typeof values.name !== "string" || !values.name.trim())
        issues.push({ fieldId: fields.Name, code: issueCodes.Required })
      if (typeof values.description !== "string")
        issues.push({
          fieldId: fields.Description,
          code: issueCodes.InvalidValue,
        })
      if (key?.channelKey === null && values.channelKey === null) {
        // Preserve existing unrestricted access when editing unrelated fields.
      } else if (!values.channelKey)
        issues.push({ fieldId: fields.Channel, code: issueCodes.Required })
      else if (
        values.channelKey !== key?.channelKey &&
        !channels.some(
          (channel) => channel.enabled && channel.key === values.channelKey,
        )
      )
        issues.push({
          fieldId: fields.Channel,
          code: issueCodes.UnsupportedOption,
        })
      if (typeof values.unlimited !== "boolean")
        issues.push({
          fieldId: fields.Unlimited,
          code: issueCodes.InvalidValue,
        })
      if (
        values.unlimited !== true &&
        (typeof values.quotaUsd !== "number" ||
          !Number.isFinite(values.quotaUsd) ||
          values.quotaUsd < 0 ||
          !Number.isSafeInteger(
            Math.round(values.quotaUsd * FOXCODE_UNITS_PER_USD),
          ))
      )
        issues.push({ fieldId: fields.Quota, code: issueCodes.OutOfRange })
      if (key && typeof values.enabled !== "boolean")
        issues.push({ fieldId: fields.Enabled, code: issueCodes.InvalidValue })
      return issues.length ? { valid: false, issues } : { valid: true }
    },
    buildCommand(values) {
      return {
        name: String(values.name).trim(),
        description:
          key?.description === null && values.description === ""
            ? null
            : String(values.description),
        channelKey:
          values.channelKey === null ? null : String(values.channelKey),
        quotaLimit:
          values.unlimited === true
            ? FOXCODE_UNLIMITED_QUOTA
            : Math.round(Number(values.quotaUsd) * FOXCODE_UNITS_PER_USD),
        isActive: values.enabled !== false,
      }
    },
  }
}
