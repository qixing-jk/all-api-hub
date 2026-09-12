import {
  NEW_API_MANAGED_RESOURCE_FIELD_IDS as F,
  supportsNewApiUpstreamModelCheck,
} from "~/constants/newApi"
import {
  type EditableResourceProjection,
  type ResourceFieldDescriptor,
  type ResourceFieldIssue,
  type ResourceValidationResult,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type { NativeResourceEditorDefinition } from "~/services/apiAdapters/managedResources/factory"
import { readNewApiSettings } from "~/services/managedSites/providers/newApiChannelSettings"
import type { NewApiChannel } from "~/types/newApi"
import type {
  NewApiChannelAdvancedPatch,
  NewApiChannelCommand,
} from "~/types/newApiChannelEditor"
import type { NewApiFamilyChannelCommand } from "~/types/newApiFamilyChannelEditor"
import { normalizeList } from "~/utils/core/string"

const readList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
const readText = (value: unknown) =>
  typeof value === "string" ? value.trim() : ""
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b)

/**
 * Extends shared mechanics with New API-owned settings and validation.
 * `setting.proxy` and `settings.upstream_model_update_*` are distinct JSON objects:
 * https://github.com/QuantumNous/new-api/blob/064ed943e1ac40e3eaca1b58ffb7fa5dacb3fde3/relaykit/dto/channel_settings.go
 * Empty strings explicitly clear top-level fields on update:
 * https://github.com/QuantumNous/new-api/blob/064ed943e1ac40e3eaca1b58ffb7fa5dacb3fde3/web/src/features/channels/lib/channel-form.ts
 */
export function withNewApiAdvancedEditor(
  editor: NativeResourceEditorDefinition<NewApiFamilyChannelCommand>,
  detail?: NewApiChannel,
): NativeResourceEditorDefinition<NewApiChannelCommand> {
  const setting = readNewApiSettings(detail?.setting)
  const settings = readNewApiSettings(detail?.settings)
  const mapping = readNewApiSettings(detail?.model_mapping)
  const validMapping =
    mapping && Object.values(mapping).every((v) => typeof v === "string")
  const initial: EditableResourceProjection = {
    [F.TestModel]: detail?.test_model ?? "",
    [F.AutoBan]: detail ? detail.auto_ban === 1 : true,
    [F.ModelMapping]: validMapping
      ? (Object.entries(mapping).flat() as string[])
      : [],
    [F.Tag]: detail?.tag ?? "",
    [F.Remark]: detail?.remark ?? "",
    [F.Proxy]: readText(setting?.proxy),
    [F.UpstreamCheck]: settings?.upstream_model_update_check_enabled === true,
    [F.UpstreamAutoSync]:
      settings?.upstream_model_update_auto_sync_enabled === true,
    [F.UpstreamIgnoredModels]: readList(
      settings?.upstream_model_update_ignored_models,
    ),
    [F.UpstreamLastCheck]:
      typeof settings?.upstream_model_update_last_check_time === "number"
        ? settings.upstream_model_update_last_check_time
        : 0,
    [F.UpstreamDetectedModels]: readList(
      settings?.upstream_model_update_last_detected_models,
    ),
    [F.UpstreamRemovedModels]: readList(
      settings?.upstream_model_update_last_removed_models,
    ),
  }
  const fields: ResourceFieldDescriptor[] = [
    { fieldId: F.TestModel, type: "text" },
    { fieldId: F.AutoBan, type: "boolean" },
    {
      fieldId: F.ModelMapping,
      type: "multi-select",
      options: [],
      readOnly: !validMapping,
    },
    { fieldId: F.Tag, type: "text" },
    { fieldId: F.Remark, type: "textarea" },
    { fieldId: F.Proxy, type: "text", readOnly: !setting },
    { fieldId: F.UpstreamCheck, type: "boolean", readOnly: !settings },
    { fieldId: F.UpstreamAutoSync, type: "boolean", readOnly: !settings },
    {
      fieldId: F.UpstreamIgnoredModels,
      type: "multi-select",
      options: [],
      readOnly: !settings,
    },
    { fieldId: F.UpstreamLastCheck, type: "number", readOnly: true },
    {
      fieldId: F.UpstreamDetectedModels,
      type: "multi-select",
      options: [],
      readOnly: true,
    },
    {
      fieldId: F.UpstreamRemovedModels,
      type: "multi-select",
      options: [],
      readOnly: true,
    },
  ]
  const changed = (values: EditableResourceProjection, id: string) =>
    values[id] !== undefined &&
    !equal(values[id], initial[id] ?? editor.initialValues[id])
  const validate = (
    values: EditableResourceProjection,
  ): ResourceValidationResult => {
    const common = editor.validate(values)
    const issues: ResourceFieldIssue[] = common.valid ? [] : [...common.issues]
    const invalid = (fieldId: string) =>
      issues.push({ fieldId, code: "invalid_value" })
    for (const field of fields) {
      if (!changed(values, field.fieldId)) continue
      if (field.readOnly) {
        invalid(field.fieldId)
        continue
      }
      const value = values[field.fieldId]
      if (field.type === "boolean" && typeof value !== "boolean")
        invalid(field.fieldId)
      if (
        (field.type === "text" || field.type === "textarea") &&
        typeof value !== "string"
      )
        invalid(field.fieldId)
      if (
        field.type === "multi-select" &&
        (!Array.isArray(value) ||
          value.some((item) => typeof item !== "string"))
      )
        invalid(field.fieldId)
    }
    if (changed(values, F.ModelMapping)) {
      const pairs = readList(values[F.ModelMapping]).map((v) => v.trim())
      const keys = pairs.filter((_, i) => i % 2 === 0)
      if (
        pairs.length % 2 ||
        pairs.some((v) => !v) ||
        new Set(keys).size !== keys.length
      )
        invalid(F.ModelMapping)
    }
    if (changed(values, F.Proxy) && readText(values[F.Proxy])) {
      try {
        const url = new URL(readText(values[F.Proxy]))
        if (
          !url.hostname ||
          !["http:", "https:", "socks5:", "socks5h:"].includes(url.protocol)
        )
          invalid(F.Proxy)
      } catch {
        invalid(F.Proxy)
      }
    }
    if (
      changed(values, F.Remark) &&
      [...readText(values[F.Remark])].length > 255
    )
      issues.push({ fieldId: F.Remark, code: "out_of_range" })
    if (
      changed(values, F.UpstreamCheck) ||
      changed(values, F.UpstreamAutoSync) ||
      changed(values, F.UpstreamIgnoredModels) ||
      changed(values, F.Type)
    ) {
      if (
        values[F.UpstreamCheck] === true &&
        !supportsNewApiUpstreamModelCheck(values[F.Type])
      )
        issues.push({ fieldId: F.UpstreamCheck, code: "unsupported_option" })
      if (
        values[F.UpstreamAutoSync] === true &&
        values[F.UpstreamCheck] !== true
      )
        issues.push({ fieldId: F.UpstreamAutoSync, code: "inconsistent_value" })
    }
    return issues.length ? { valid: false, issues } : { valid: true }
  }
  return {
    ...editor,
    fields: [...editor.fields, ...fields],
    initialValues: { ...editor.initialValues, ...initial },
    validate,
    buildCommand: (values) => {
      const advanced: NewApiChannelAdvancedPatch = {}
      for (const [id, key] of [
        [F.TestModel, "test_model"],
        [F.Tag, "tag"],
        [F.Remark, "remark"],
      ] as const) {
        if (changed(values, id)) advanced[key] = readText(values[id])
      }
      if (changed(values, F.AutoBan))
        advanced.auto_ban = values[F.AutoBan] ? 1 : 0
      if (changed(values, F.ModelMapping)) {
        const pairs = readList(values[F.ModelMapping]).map((v) => v.trim())
        advanced.model_mapping = pairs.length
          ? JSON.stringify(
              Object.fromEntries(
                pairs.flatMap((key, i) => (i % 2 ? [] : [[key, pairs[i + 1]]])),
              ),
            )
          : ""
      }
      if (changed(values, F.Proxy))
        advanced.setting = { proxy: readText(values[F.Proxy]) }
      for (const [id, key] of [
        [F.UpstreamCheck, "upstream_model_update_check_enabled"],
        [F.UpstreamAutoSync, "upstream_model_update_auto_sync_enabled"],
      ] as const) {
        if (changed(values, id))
          (advanced.settings ??= {})[key] = values[id] === true
      }
      if (changed(values, F.UpstreamIgnoredModels))
        (advanced.settings ??= {}).upstream_model_update_ignored_models =
          normalizeList(readList(values[F.UpstreamIgnoredModels]))
      return {
        ...editor.buildCommand(values),
        ...(Object.keys(advanced).length ? { advanced } : {}),
      }
    },
  }
}
