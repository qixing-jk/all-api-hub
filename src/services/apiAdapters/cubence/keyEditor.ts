import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/keys/accountKeyNames"
import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/definition"
import type { AccountKeyCreationIntent } from "~/services/apiAdapters/contracts/accountKeyResource"
import type {
  ResourceFieldDescriptor,
  ResourceFieldIssue,
  ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/resourceNative"
import { CUBENCE_UNITS_PER_USD } from "~/services/apiService/cubence"
import type {
  CubenceGroup,
  CubenceKey,
  CubenceKeyInput,
  CubenceKeyUpdate,
} from "~/services/apiService/cubence/keys"

import { getCubenceGroupDisplayName } from "./groupPresentation"

export type CubenceKeyCommand = CubenceKeyInput & CubenceKeyUpdate

/** Matches the native name/quota/group form; name cannot be edited upstream. */
export function createCubenceKeyEditor(
  loadGroups: (
    options?: ResourceOperationOptions,
  ) => Promise<readonly CubenceGroup[]>,
  key?: CubenceKey,
  intent?: AccountKeyCreationIntent,
): AccountKeyResourceEditorDefinition<CubenceKeyCommand> {
  let groups: readonly CubenceGroup[] = []
  let groupLoadGeneration = 0
  const fields: ResourceFieldDescriptor[] = [
    ...(!key
      ? [{ fieldId: "name", type: "text" as const, required: true }]
      : []),
    { fieldId: "unlimited", type: "boolean" },
    { fieldId: "quota", type: "number", min: 0.000001, step: 0.000001 },
    {
      fieldId: "group",
      type: "select",
      required: true,
      options: [],
      optionLoader: { dependsOn: [] },
    },
    ...(key ? [{ fieldId: "enabled", type: "boolean" as const }] : []),
  ]
  return {
    fields,
    async loadOptions(fieldId, _values, options) {
      if (fieldId !== "group") return []
      const generation = ++groupLoadGeneration
      groups = []
      const loaded = await loadGroups(options)
      options?.signal?.throwIfAborted()
      const allowed =
        !key && intent?.allowedGroups !== undefined
          ? loaded.filter((group) =>
              intent.allowedGroups!.includes(String(group.id)),
            )
          : loaded
      if (generation === groupLoadGeneration) groups = allowed
      return allowed
        .filter((group) => group.is_active || group.id === key?.share_group_id)
        .map((group) => ({
          value: String(group.id),
          displayLabel: getCubenceGroupDisplayName(group),
          secondaryLabel: `${group.multiplier}x`,
        }))
    },
    initialValues: {
      name:
        key?.name ??
        intent?.nameHint?.trim() ??
        DEFAULT_AUTO_PROVISION_KEY_NAME,
      unlimited: key?.quota_limit === -1,
      quota:
        key && key.quota_limit !== -1
          ? key.quota_limit / CUBENCE_UNITS_PER_USD
          : 10,
      group: key ? String(key.share_group_id) : intent?.preferredGroup ?? "",
      enabled: key ? key.status === "active" : true,
    },
    validate(values) {
      const issues: ResourceFieldIssue[] = []
      if (!key && (typeof values.name !== "string" || !values.name.trim()))
        issues.push({ fieldId: "name", code: "required" })
      if (!values.group) issues.push({ fieldId: "group", code: "required" })
      else if (
        !groups.some(
          (group) =>
            String(group.id) === values.group &&
            (group.is_active || group.id === key?.share_group_id),
        )
      )
        issues.push({ fieldId: "group", code: "unsupported_option" })
      if (
        values.unlimited !== true &&
        (typeof values.quota !== "number" ||
          !Number.isFinite(values.quota) ||
          values.quota < 1 / CUBENCE_UNITS_PER_USD ||
          !Number.isSafeInteger(
            Math.round(values.quota * CUBENCE_UNITS_PER_USD),
          ))
      )
        issues.push({ fieldId: "quota", code: "out_of_range" })
      return issues.length ? { valid: false, issues } : { valid: true }
    },
    buildCommand: (values) => ({
      name: key?.name ?? String(values.name).trim(),
      quota_limit:
        values.unlimited === true
          ? -1
          : Math.round(Number(values.quota) * CUBENCE_UNITS_PER_USD),
      share_group_id: Number(values.group),
      status: values.enabled === false ? "disabled" : "active",
    }),
  }
}
