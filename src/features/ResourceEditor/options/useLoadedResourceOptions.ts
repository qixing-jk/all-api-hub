import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type {
  EditableResourceProjection,
  ResourceFieldDescriptor,
  ResourceFieldOption,
  ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/resourceNative"
import {
  RESOURCE_FIELD_OPTION_LOAD_TRIGGERS,
  RESOURCE_FIELD_TYPES,
} from "~/services/apiAdapters/contracts/resourceNative"
import { getErrorMessage } from "~/utils/core/error"

export const RESOURCE_OPTION_LOAD_STATUSES = {
  Loading: "loading",
  Ready: "ready",
  Error: "error",
} as const

export type ResourceOptionLoadState =
  | {
      status: typeof RESOURCE_OPTION_LOAD_STATUSES.Loading
      options: readonly ResourceFieldOption[]
    }
  | {
      status: typeof RESOURCE_OPTION_LOAD_STATUSES.Ready
      options: readonly ResourceFieldOption[]
    }
  | {
      status: typeof RESOURCE_OPTION_LOAD_STATUSES.Error
      options: readonly ResourceFieldOption[]
      errorMessage?: string
    }

/** Controller-owned option state for editors whose loading lifecycle is external. */
export type ResourceEditorControlledOptionState = {
  status: ResourceOptionLoadState["status"]
  options: readonly ResourceFieldOption[]
  errorMessage?: string
  emptyMessage?: string
}

type DynamicOptionFieldDescriptor = Extract<
  ResourceFieldDescriptor,
  {
    type:
      | typeof RESOURCE_FIELD_TYPES.Select
      | typeof RESOURCE_FIELD_TYPES.MultiSelect
  }
>

type ActiveOptionLoad = {
  controller: AbortController
  signature: string
  retryGeneration: number
  generation: number
}

type LoadOptions = (
  fieldId: string,
  values: EditableResourceProjection,
  options: ResourceOperationOptions,
) => Promise<readonly ResourceFieldOption[]>

const descriptorOptions = (descriptor: ResourceFieldDescriptor) =>
  descriptor.type === RESOURCE_FIELD_TYPES.Select ||
  descriptor.type === RESOURCE_FIELD_TYPES.MultiSelect
    ? descriptor.options
    : []

export const isDynamicOptionField = (
  descriptor: ResourceFieldDescriptor,
): descriptor is DynamicOptionFieldDescriptor =>
  (descriptor.type === RESOURCE_FIELD_TYPES.Select ||
    descriptor.type === RESOURCE_FIELD_TYPES.MultiSelect) &&
  descriptor.optionLoader !== undefined

const describeDependencyValue = (value: unknown): string => {
  if (value === undefined) return "undefined"
  if (value === null) return "null"
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "number:NaN"
    if (!Number.isFinite(value))
      return `number:${value > 0 ? "Infinity" : "-Infinity"}`
  }
  if (typeof value === "string") return `string:${JSON.stringify(value)}`
  if (typeof value === "boolean") return `boolean:${value}`
  if (Array.isArray(value)) {
    return `array:[${value.map(describeDependencyValue).join(",")}]`
  }
  if (typeof value === "object") {
    return `object:{${Object.entries(value as Record<string, unknown>)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([key, entry]) => `${key}:${describeDependencyValue(entry)}`)
      .join(",")}}`
  }
  return `${typeof value}:${String(value)}`
}

const dependencySignature = (
  descriptor: ResourceFieldDescriptor,
  values: EditableResourceProjection,
) =>
  descriptor.type === RESOURCE_FIELD_TYPES.Select ||
  descriptor.type === RESOURCE_FIELD_TYPES.MultiSelect
    ? descriptor.optionLoader?.dependsOn
        .map(
          (fieldId) => `${fieldId}:${describeDependencyValue(values[fieldId])}`,
        )
        .join("|") ?? ""
    : ""

/** Loads descriptor-owned options while discarding work invalidated by dependencies. */
export function useLoadedResourceOptions(
  activeDescriptors: readonly ResourceFieldDescriptor[],
  values: EditableResourceProjection,
  onLoadOptions: LoadOptions | undefined,
) {
  const [states, setStates] = useState<
    ReadonlyMap<string, ResourceOptionLoadState>
  >(() => new Map())
  const [retryGenerations, setRetryGenerations] = useState<
    ReadonlyMap<string, number>
  >(() => new Map())
  const activeLoads = useRef(new Map<string, ActiveOptionLoad>())
  const dynamicFields = useMemo(
    () =>
      onLoadOptions
        ? activeDescriptors.filter(isDynamicOptionField).map((descriptor) => ({
            descriptor,
            signature: dependencySignature(descriptor, values),
          }))
        : [],
    [activeDescriptors, onLoadOptions, values],
  )

  const startLoad = useCallback(
    (
      descriptor: DynamicOptionFieldDescriptor,
      signature: string,
      retryGeneration: number,
    ) => {
      if (!onLoadOptions) return
      const previousLoad = activeLoads.current.get(descriptor.fieldId)
      previousLoad?.controller.abort()
      const controller = new AbortController()
      const generation = (previousLoad?.generation ?? 0) + 1
      activeLoads.current.set(descriptor.fieldId, {
        controller,
        signature,
        retryGeneration,
        generation,
      })
      setStates((current) => {
        const next = new Map(current)
        next.set(descriptor.fieldId, {
          status: RESOURCE_OPTION_LOAD_STATUSES.Loading,
          options:
            next.get(descriptor.fieldId)?.options ??
            descriptorOptions(descriptor),
        })
        return next
      })
      void onLoadOptions(descriptor.fieldId, values, {
        signal: controller.signal,
      })
        .then((options) => {
          if (
            controller.signal.aborted ||
            activeLoads.current.get(descriptor.fieldId)?.generation !==
              generation
          ) {
            return
          }
          setStates((current) => {
            const next = new Map(current)
            next.set(descriptor.fieldId, {
              status: RESOURCE_OPTION_LOAD_STATUSES.Ready,
              options,
            })
            return next
          })
        })
        .catch((error) => {
          if (
            controller.signal.aborted ||
            activeLoads.current.get(descriptor.fieldId)?.generation !==
              generation
          ) {
            return
          }
          setStates((current) => {
            const next = new Map(current)
            next.set(descriptor.fieldId, {
              status: RESOURCE_OPTION_LOAD_STATUSES.Error,
              options:
                next.get(descriptor.fieldId)?.options ??
                descriptorOptions(descriptor),
              errorMessage: getErrorMessage(error) || undefined,
            })
            return next
          })
        })
    },
    [onLoadOptions, values],
  )

  useEffect(() => {
    const activeFieldIds = new Set(
      dynamicFields.map(({ descriptor }) => descriptor.fieldId),
    )
    for (const [fieldId, activeLoad] of activeLoads.current) {
      if (!activeFieldIds.has(fieldId)) {
        activeLoad.controller.abort()
        activeLoads.current.delete(fieldId)
      }
    }
    setStates((current) => {
      const next = new Map(current)
      for (const fieldId of current.keys()) {
        if (!activeFieldIds.has(fieldId)) next.delete(fieldId)
      }
      return next.size === current.size ? current : next
    })
    setRetryGenerations((current) => {
      const next = new Map(current)
      for (const fieldId of current.keys()) {
        if (!activeFieldIds.has(fieldId)) next.delete(fieldId)
      }
      return next.size === current.size ? current : next
    })
    if (!onLoadOptions) return
    for (const { descriptor, signature } of dynamicFields) {
      const retryGeneration = retryGenerations.get(descriptor.fieldId) ?? 0
      const previousLoad = activeLoads.current.get(descriptor.fieldId)
      if (previousLoad && previousLoad.signature !== signature) {
        previousLoad.controller.abort()
        activeLoads.current.delete(descriptor.fieldId)
        setStates((current) => {
          if (!current.has(descriptor.fieldId)) return current
          const next = new Map(current)
          next.delete(descriptor.fieldId)
          return next
        })
      }
      if (
        descriptor.optionLoader?.trigger ===
        RESOURCE_FIELD_OPTION_LOAD_TRIGGERS.Manual
      ) {
        continue
      }
      const currentLoad = activeLoads.current.get(descriptor.fieldId)
      if (
        currentLoad?.signature === signature &&
        currentLoad.retryGeneration === retryGeneration
      ) {
        continue
      }
      startLoad(descriptor, signature, retryGeneration)
    }
  }, [dynamicFields, onLoadOptions, retryGenerations, startLoad])

  useEffect(
    () => () => {
      for (const { controller } of activeLoads.current.values()) {
        controller.abort()
      }
      activeLoads.current.clear()
    },
    [],
  )

  return {
    states,
    load: (fieldId: string) => {
      const field = dynamicFields.find(
        ({ descriptor }) => descriptor.fieldId === fieldId,
      )
      if (!field) return
      startLoad(
        field.descriptor,
        field.signature,
        retryGenerations.get(fieldId) ?? 0,
      )
    },
    retry: (fieldId: string) =>
      setRetryGenerations((current) => {
        const next = new Map(current)
        next.set(fieldId, (next.get(fieldId) ?? 0) + 1)
        return next
      }),
  }
}
