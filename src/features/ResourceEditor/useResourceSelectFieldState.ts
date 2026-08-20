import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react"

import type {
  EditableResourceProjection,
  ResourceFieldDescriptor,
  ResourceFieldValue,
} from "~/services/apiAdapters/contracts/resourceNative"
import { RESOURCE_FIELD_TYPES } from "~/services/apiAdapters/contracts/resourceNative"

import {
  normalizeResourceList,
  readResourceList,
  readResourceString,
} from "./resourceEditorProjection"
import type { ResourceFieldPresentation } from "./resourceFieldPolicy"
import {
  createSelectOptionTokenSnapshot,
  type SelectOptionTokenRegistry,
} from "./selectOptionTokenRegistry"
import {
  isDynamicOptionField,
  RESOURCE_OPTION_LOAD_STATUSES,
  type ResourceEditorControlledOptionState,
  type ResourceOptionLoadState,
} from "./useLoadedResourceOptions"

type ResolvedResourceField<TSection extends string> = {
  descriptor: ResourceFieldDescriptor
  presentation: ResourceFieldPresentation<TSection>
}

type Options<TSection extends string> = {
  fields: readonly ResolvedResourceField<TSection>[]
  values: EditableResourceProjection
  optionStates: ReadonlyMap<string, ResourceOptionLoadState>
  controlledOptionStates?: Readonly<
    Record<string, ResourceEditorControlledOptionState | undefined>
  >
  canLoadOptions: boolean
  onValueChange: (fieldId: string, value: ResourceFieldValue) => void
}

/** Owns select option identity and automatic-selection state across rerenders. */
export function useResourceSelectFieldState<TSection extends string>({
  fields,
  values,
  optionStates,
  controlledOptionStates,
  canLoadOptions,
  onValueChange,
}: Options<TSection>) {
  const pendingAutoSelections = useRef(
    new Map<string, { currentValue: string; nextValue: string }>(),
  )
  const selectOptionSnapshots = useRef(new Map<string, readonly string[]>())
  const selectOptionTokenRegistries = useRef(
    new Map<string, SelectOptionTokenRegistry>(),
  )
  // Resource mappings are pruned with hidden fields, while the per-field epoch
  // stays for this component lifetime so a detached option cannot select a
  // different value after that field becomes visible again.
  const selectOptionTokenEpochs = useRef(new Map<string, number>())
  const activeSelectValueByToken = useRef(
    new Map<string, ReadonlyMap<string, string | null>>(),
  )

  const selectOptionsByFieldId = useMemo(
    () =>
      new Map(
        fields.flatMap(({ descriptor, presentation }) => {
          if (descriptor.type !== RESOURCE_FIELD_TYPES.Select) return []
          const controlledOptionState =
            controlledOptionStates?.[descriptor.fieldId]
          const options =
            (controlledOptionState?.status ===
            RESOURCE_OPTION_LOAD_STATUSES.Ready
              ? controlledOptionState.options
              : canLoadOptions && isDynamicOptionField(descriptor)
                ? optionStates.get(descriptor.fieldId)?.options
                : undefined) ?? descriptor.options
          const sourceValues =
            presentation.optionSourceFieldIds?.flatMap((fieldId) =>
              readResourceList(values, fieldId),
            ) ?? []
          const optionValues = normalizeResourceList([
            ...options.map((option) => option.value),
            ...sourceValues,
          ])
          return [[descriptor.fieldId, optionValues] as const]
        }),
      ),
    [canLoadOptions, controlledOptionStates, fields, optionStates, values],
  )

  const selectTokenRegistriesByFieldId = useMemo(
    () =>
      new Map(
        fields.flatMap(({ descriptor }) => {
          if (descriptor.type !== RESOURCE_FIELD_TYPES.Select) return []
          const selectedValue = readResourceString(values, descriptor.fieldId)
          const optionValues =
            selectOptionsByFieldId.get(descriptor.fieldId) ?? []
          const resourceValues = [
            ...(selectedValue && !optionValues.includes(selectedValue)
              ? [selectedValue]
              : []),
            ...optionValues,
          ]
          return [
            [
              descriptor.fieldId,
              createSelectOptionTokenSnapshot(
                selectOptionTokenRegistries.current.get(descriptor.fieldId),
                resourceValues,
                selectOptionTokenEpochs.current.get(descriptor.fieldId),
              ),
            ] as const,
          ]
        }),
      ),
    [fields, selectOptionsByFieldId, values],
  )

  useLayoutEffect(() => {
    const activeFieldIds = new Set(selectTokenRegistriesByFieldId.keys())
    for (const fieldId of selectOptionTokenRegistries.current.keys()) {
      if (!activeFieldIds.has(fieldId))
        selectOptionTokenRegistries.current.delete(fieldId)
    }
    for (const [fieldId, registry] of selectTokenRegistriesByFieldId) {
      selectOptionTokenRegistries.current.set(fieldId, registry)
      selectOptionTokenEpochs.current.set(fieldId, registry.nextToken)
    }
    activeSelectValueByToken.current = new Map(
      fields.flatMap(({ descriptor, presentation }) => {
        if (descriptor.type !== RESOURCE_FIELD_TYPES.Select) return []
        const registry = selectTokenRegistriesByFieldId.get(descriptor.fieldId)
        if (!registry) return []
        const activeTokens = new Map<string, string | null>([
          ...(descriptor.nullable && presentation.resolveNullableOptionLabel
            ? [[registry.nullToken, null] as const]
            : []),
          ...registry.resourceValueByToken,
        ])
        return [[descriptor.fieldId, activeTokens] as const]
      }),
    )
  }, [fields, selectTokenRegistriesByFieldId])

  useEffect(() => {
    for (const { descriptor, presentation } of fields) {
      if (
        descriptor.type !== RESOURCE_FIELD_TYPES.Select ||
        !presentation.autoSelectFirstOption
      )
        continue
      const optionValues = selectOptionsByFieldId.get(descriptor.fieldId) ?? []
      const currentValue = readResourceString(values, descriptor.fieldId)
      const previousOptionValues = selectOptionSnapshots.current.get(
        descriptor.fieldId,
      )
      const optionsChanged =
        previousOptionValues !== undefined &&
        (previousOptionValues.length !== optionValues.length ||
          previousOptionValues.some(
            (value, index) => value !== optionValues[index],
          ))
      selectOptionSnapshots.current.set(descriptor.fieldId, optionValues)
      if (optionValues.length === 0 || optionValues.includes(currentValue)) {
        pendingAutoSelections.current.delete(descriptor.fieldId)
        continue
      }
      if (currentValue && !optionsChanged) {
        pendingAutoSelections.current.delete(descriptor.fieldId)
        continue
      }
      const nextValue = optionValues[0]
      const pending = pendingAutoSelections.current.get(descriptor.fieldId)
      if (
        pending?.currentValue === currentValue &&
        pending.nextValue === nextValue
      )
        continue
      pendingAutoSelections.current.set(descriptor.fieldId, {
        currentValue,
        nextValue,
      })
      onValueChange(descriptor.fieldId, nextValue)
    }
  }, [fields, onValueChange, selectOptionsByFieldId, values])

  const resolveSelectValue = useCallback((fieldId: string, token: string) => {
    const activeTokens = activeSelectValueByToken.current.get(fieldId)
    return activeTokens?.has(token)
      ? { active: true as const, value: activeTokens.get(token) ?? null }
      : { active: false as const }
  }, [])

  return {
    selectOptionsByFieldId,
    selectTokenRegistriesByFieldId,
    resolveSelectValue,
  }
}
