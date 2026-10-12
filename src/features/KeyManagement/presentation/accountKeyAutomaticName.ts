import { ACCOUNT_KEY_AUTOMATIC_NAME_KINDS } from "~/features/KeyManagement/presentation/accountKeyResourceEditorPresentation"
import { getDefaultAccountKeyName } from "~/services/accounts/keys/accountKeyNames"
import type {
  EditableResourceProjection,
  ResourceFieldOption,
} from "~/services/apiAdapters/contracts/resourceNative"

import type { AccountKeyAutomaticNamePolicy } from "./accountKeyResourceEditorPresentation"

/** Resolve the group-based name; the draft owns whether the name still follows it. */
export function resolveAccountKeyAutomaticName(
  policy: AccountKeyAutomaticNamePolicy,
  values: EditableResourceProjection,
  optionsByField?: Readonly<Record<string, readonly ResourceFieldOption[]>>,
): string | undefined {
  if (policy.kind === ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed) return undefined
  const value = values[policy.fieldId]
  const selected = Array.isArray(value)
    ? value.length === 1
      ? value[0]
      : null
    : value
  if (selected == null || selected === "") return policy.unselectedName
  if (typeof selected !== "string") return undefined
  const label = policy.useOptionLabels
    ? optionsByField?.[policy.fieldId]?.find(
        (option) => option.value === selected,
      )?.displayLabel
    : selected
  return label === undefined ? undefined : getDefaultAccountKeyName(label)
}
