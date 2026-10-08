import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { type ResourceEditorControlledOptionState } from "~/features/ResourceEditor/useLoadedResourceOptions"
import type {
  EditableResourceProjection,
  ResourceFieldDescriptor,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  RESOURCE_FIELD_OPTION_LOAD_TRIGGERS,
  RESOURCE_FIELD_TYPES,
  type ResourceFieldValue,
} from "~/services/apiAdapters/contracts/resourceNative"

import { getNativeKeyResourceEditorPresentation } from "../../presentation/nativeKeyResourceFieldPolicy"
import type {
  AccountKeyResourceEditorDialogProps,
  AccountKeyResourceEditorDialogState,
} from "./AccountKeyResourceEditorDialog"
import { feedbackDescription } from "./accountKeyResourceEditorFeedback"

type DynamicOptionField = Extract<
  ResourceFieldDescriptor,
  {
    type:
      | typeof RESOURCE_FIELD_TYPES.Select
      | typeof RESOURCE_FIELD_TYPES.MultiSelect
  }
>

const isDynamicOptionField = (
  descriptor: ResourceFieldDescriptor,
): descriptor is DynamicOptionField =>
  (descriptor.type === RESOURCE_FIELD_TYPES.Select ||
    descriptor.type === RESOURCE_FIELD_TYPES.MultiSelect) &&
  descriptor.optionLoader !== undefined

const isSameProjection = (
  left: EditableResourceProjection,
  right: EditableResourceProjection,
) => JSON.stringify(left) === JSON.stringify(right)

/** Converts adapter-owned UTC instants to the local value shape required by datetime-local. */
const toLocalDateTimeInputValue = (
  value: ResourceFieldValue,
): ResourceFieldValue => {
  if (typeof value !== "string" || !value.endsWith("Z")) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (part: number) => String(part).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const toEditorValues = (
  values: EditableResourceProjection,
  fields: readonly ResourceFieldDescriptor[],
): EditableResourceProjection => {
  const result = { ...values }
  for (const descriptor of fields) {
    const value = values[descriptor.fieldId]
    if (
      descriptor.type === RESOURCE_FIELD_TYPES.DateTime &&
      value !== undefined &&
      Object.hasOwn(values, descriptor.fieldId)
    )
      result[descriptor.fieldId] = toLocalDateTimeInputValue(value)
  }
  return result
}

/** Coordinates local draft and option dependencies for one keyed editor session. */
export function useAccountKeyResourceEditorDraft({
  editor,
  onSubmit,
  onValuesChange,
  onLoadOptions,
  onCommitClose,
}: Pick<
  AccountKeyResourceEditorDialogProps,
  "onSubmit" | "onValuesChange" | "onLoadOptions"
> & {
  editor: AccountKeyResourceEditorDialogState
  onCommitClose: (editorId: number) => void
}) {
  const { t } = useTranslation()
  const presentation = getNativeKeyResourceEditorPresentation(
    editor.siteType,
    editor.mode,
    { fields: editor.fields },
  )
  const [values, setValues] = useState<EditableResourceProjection>(() =>
    toEditorValues(editor.values, editor.fields),
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(
    presentation.collapsibleSection?.initiallyOpen(editor.values) ?? false,
  )
  const submittingRef = useRef(false)
  const initialValuesRef = useRef<EditableResourceProjection>(
    toEditorValues(editor.initialValues, editor.fields),
  )
  const valuesRef = useRef(values)
  const loadedOptionSignaturesRef = useRef(new Map<string, string>())

  useEffect(() => {
    const controllerValues = toEditorValues(editor.values, editor.fields)
    if (!isSameProjection(valuesRef.current, controllerValues)) {
      valuesRef.current = controllerValues
      setValues(controllerValues)
    }
  }, [editor.fields, editor.values])

  const dynamicOptionFields = useMemo(
    () => editor.fields.filter(isDynamicOptionField),
    [editor.fields],
  )
  const automaticDynamicOptionFields = useMemo(
    () =>
      dynamicOptionFields.filter(
        (descriptor) =>
          descriptor.optionLoader?.trigger !==
          RESOURCE_FIELD_OPTION_LOAD_TRIGGERS.Manual,
      ),
    [dynamicOptionFields],
  )

  useEffect(() => {
    if (!onLoadOptions) return
    for (const candidate of automaticDynamicOptionFields) {
      const signature = (candidate.optionLoader?.dependsOn ?? [])
        .map((fieldId) => JSON.stringify(values[fieldId]))
        .join("|")
      if (
        loadedOptionSignaturesRef.current.get(candidate.fieldId) === signature
      )
        continue
      loadedOptionSignaturesRef.current.set(candidate.fieldId, signature)
      onLoadOptions(editor.editorId, candidate.fieldId, values)
    }
  }, [automaticDynamicOptionFields, editor.editorId, onLoadOptions, values])

  const controlledOptionStates:
    | Readonly<Record<string, ResourceEditorControlledOptionState>>
    | undefined = onLoadOptions
    ? Object.fromEntries(
        dynamicOptionFields.map(
          (descriptor): [string, ResourceEditorControlledOptionState] => {
            const options = editor.optionsByField?.[descriptor.fieldId]
            const failure = editor.optionFailuresByField?.[descriptor.fieldId]
            const isLoading = editor.loadingFieldIds?.includes(
              descriptor.fieldId,
            )
            const isManual =
              descriptor.optionLoader?.trigger ===
              RESOURCE_FIELD_OPTION_LOAD_TRIGGERS.Manual
            const feedback = presentation.getOptionFeedback?.(
              descriptor,
              options,
              failure,
              t,
            )
            const ignoreFailure = feedback?.ignoreFailure === true
            return [
              descriptor.fieldId,
              {
                status: isLoading
                  ? "loading"
                  : failure
                    ? ignoreFailure
                      ? "ready"
                      : "error"
                    : options || isManual
                      ? "ready"
                      : "loading",
                options: options ?? [],
                ...(failure && !ignoreFailure
                  ? { errorMessage: feedbackDescription(failure, t) }
                  : {}),
                ...(feedback?.emptyMessage
                  ? { emptyMessage: feedback.emptyMessage }
                  : {}),
              },
            ]
          },
        ),
      )
    : undefined
  const hasUnresolvedDependentOptions = dynamicOptionFields.some(
    (descriptor) => {
      const state = controlledOptionStates?.[descriptor.fieldId]
      if (!state || state.status === "ready") return false
      const value = values[descriptor.fieldId]
      const hasSelectedValue = Array.isArray(value)
        ? value.length > 0
        : value !== null && value !== undefined && value !== ""
      if (presentation.requireFreshOptions)
        return descriptor.required || hasSelectedValue
      const isUnchanged =
        JSON.stringify(value) ===
        JSON.stringify(initialValuesRef.current[descriptor.fieldId])
      return (
        (descriptor.required && !hasSelectedValue) ||
        (hasSelectedValue && !isUnchanged)
      )
    },
  )

  const updateValues = (fieldId: string, value: ResourceFieldValue) => {
    const next = { ...valuesRef.current, [fieldId]: value }
    for (const candidate of dynamicOptionFields) {
      if (
        candidate.optionLoader?.trigger !==
          RESOURCE_FIELD_OPTION_LOAD_TRIGGERS.Manual &&
        candidate.optionLoader?.dependsOn.includes(fieldId)
      ) {
        next[candidate.fieldId] = candidate.nullable
          ? null
          : candidate.type === RESOURCE_FIELD_TYPES.MultiSelect
            ? []
            : ""
      }
    }
    const previousAutoName = presentation.getAutomaticName?.(
      valuesRef.current,
      editor.optionsByField,
    )
    const nextAutoName = presentation.getAutomaticName?.(
      next,
      editor.optionsByField,
    )
    if (
      previousAutoName !== undefined &&
      next.name === previousAutoName &&
      nextAutoName !== undefined
    ) {
      next.name = nextAutoName
    }
    valuesRef.current = next
    setValues(next)
    onValuesChange(editor.editorId, next)
  }
  const close = () => {
    onCommitClose(editor.editorId)
  }
  const requestClose = () => {
    if (isSubmitting) return
    if (!isSameProjection(values, initialValuesRef.current)) {
      setConfirmDiscard(true)
      return
    }
    close()
  }
  const submit = async () => {
    if (submittingRef.current || hasUnresolvedDependentOptions) return
    submittingRef.current = true
    setIsSubmitting(true)
    try {
      const submitValues = { ...values }
      // datetime-local shows minutes. Preserve the original seconds when that
      // visible field was not edited instead of truncating an upstream expiry.
      for (const descriptor of editor.fields) {
        const previousInitialValue =
          initialValuesRef.current[descriptor.fieldId]
        const nextInitialValue = editor.initialValues[descriptor.fieldId]
        if (
          descriptor.type === RESOURCE_FIELD_TYPES.DateTime &&
          previousInitialValue !== undefined &&
          nextInitialValue !== undefined &&
          values[descriptor.fieldId] === previousInitialValue
        )
          submitValues[descriptor.fieldId] = nextInitialValue
      }
      await onSubmit(editor.editorId, submitValues)
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  return {
    presentation,
    values,
    isSubmitting,
    confirmDiscard,
    setConfirmDiscard,
    isAdvancedOpen,
    setIsAdvancedOpen,
    controlledOptionStates,
    hasUnresolvedDependentOptions,
    updateValues,
    close,
    requestClose,
    submit,
  }
}
