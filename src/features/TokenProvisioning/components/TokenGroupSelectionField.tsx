import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import {
  FormField,
  SearchableSelect,
  type SearchableSelectOption,
} from "~/components/ui"
import type { UserGroupInfo } from "~/services/accountTokens/tokenProvisioningModel"

interface TokenGroupSelectionFieldProps {
  id?: string
  group: string
  onChange: (value: string) => void
  groups: Record<string, UserGroupInfo>
  allowedGroups?: readonly string[]
  error?: string
  required?: boolean
  disabled?: boolean
}

const normalizeAllowedGroups = (
  allowedGroups: readonly string[] | undefined,
): string[] =>
  Array.isArray(allowedGroups)
    ? [...new Set(allowedGroups.map((value) => value.trim()).filter(Boolean))]
    : []

/** Builds one canonical group label/order contract for every token form. */
function buildTokenGroupSelectOptions(params: {
  groups: Record<string, UserGroupInfo>
  allowedGroups: readonly string[]
  groupRateLabel: string
}): SearchableSelectOption[] {
  const allowedGroupSet =
    params.allowedGroups.length > 0 ? new Set(params.allowedGroups) : null
  const allowedGroupOrder = new Map(
    params.allowedGroups.map((allowedGroup, index) => [allowedGroup, index]),
  )
  const groupKeys = new Set([
    ...Object.keys(params.groups),
    ...params.allowedGroups,
  ])

  return [...groupKeys]
    .map((key) => {
      const groupInfo = params.groups[key]
      const desc = groupInfo?.desc?.trim()
      const label = (() => {
        if (!groupInfo) return key

        const ratioLabel = `${params.groupRateLabel} ${groupInfo.ratio}`
        return !desc || desc === key
          ? `${key} (${ratioLabel})`
          : `${key} - ${desc} (${ratioLabel})`
      })()

      return {
        value: key,
        label,
        disabled: allowedGroupSet ? !allowedGroupSet.has(key) : false,
      }
    })
    .sort((a, b) => {
      if (!allowedGroupSet) return 0

      if (a.disabled !== b.disabled) return a.disabled ? 1 : -1
      if (!a.disabled) {
        return (
          (allowedGroupOrder.get(a.value) ?? Number.POSITIVE_INFINITY) -
          (allowedGroupOrder.get(b.value) ?? Number.POSITIVE_INFINITY)
        )
      }

      return a.value.localeCompare(b.value)
    })
}

/** Shared token-group field with consistent metadata, restrictions, and ordering. */
export function TokenGroupSelectionField({
  id = "groupSelect",
  group,
  onChange,
  groups,
  allowedGroups,
  error,
  required,
  disabled,
}: TokenGroupSelectionFieldProps) {
  const { t } = useTranslation("keyManagement")
  const normalizedAllowedGroups = useMemo(
    () => normalizeAllowedGroups(allowedGroups),
    [allowedGroups],
  )
  const options = useMemo(
    () =>
      buildTokenGroupSelectOptions({
        groups,
        allowedGroups: normalizedAllowedGroups,
        groupRateLabel: t("dialog.groupRate"),
      }),
    [groups, normalizedAllowedGroups, t],
  )
  const isRestricted = normalizedAllowedGroups.length > 0

  return (
    <FormField
      label={t("dialog.groupLabel")}
      htmlFor={id}
      error={error}
      required={required}
      description={isRestricted ? t("dialog.groupRestrictedNote") : undefined}
    >
      <SearchableSelect
        id={id}
        options={options}
        value={group ?? ""}
        onChange={onChange}
        placeholder={t("dialog.groupLabel")}
        aria-invalid={Boolean(error)}
        disabled={disabled}
      />
    </FormField>
  )
}
