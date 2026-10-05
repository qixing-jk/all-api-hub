import { useCallback } from "react"
import type { RefObject } from "react"

import type { CreatedRuntimeSecret } from "~/services/accounts/createdRuntimeSecret"
import {
  type AccountKeyResourceEditor,
  type EditableResourceProjection,
} from "~/services/apiAdapters/contracts/accountKeyResource"

import type {
  EditorState,
  LoadOptionsEditor,
} from "./accountKeyResourceControllerTypes"
import {
  isAborted,
  resetInvalidOptionValue,
  toFailure,
} from "./accountKeyResourceWorkflowSupport"

type WorkflowInputs = {
  runtime: {
    editorStateRef: RefObject<EditorState>
    editorRef: RefObject<AccountKeyResourceEditor | null>
    createdSecretRef: RefObject<CreatedRuntimeSecret | null>
    editorGeneration: RefObject<number>
    editorFieldGenerations: RefObject<Record<string, number>>
    editorFieldAbortControllers: RefObject<Map<string, AbortController>>
    editorFieldDependencySignatures: RefObject<Map<string, string>>
  }
  actions: {
    transitionEditor: (
      transition: (current: EditorState) => EditorState,
    ) => EditorState
  }
}

/** Owns editor option commands while the controller coordinates shared lifecycle boundaries. */
export function useAccountKeyResourceEditorOptionsWorkflow({
  runtime: {
    editorStateRef,
    editorRef,
    createdSecretRef,
    editorGeneration,
    editorFieldGenerations,
    editorFieldAbortControllers,
    editorFieldDependencySignatures,
  },
  actions: { transitionEditor },
}: WorkflowInputs) {
  const loadEditorOptions = useCallback(
    async (
      editorId: number,
      fieldId: string,
      values?: EditableResourceProjection,
      editorOverride?: LoadOptionsEditor,
    ) => {
      const currentEditorState = editorStateRef.current
      const nativeEditor = editorOverride ?? editorRef.current
      if (
        createdSecretRef.current !== null ||
        !nativeEditor?.loadOptions ||
        !currentEditorState ||
        currentEditorState.editorId !== editorId
      )
        return
      const editorVersion = editorGeneration.current
      const nextGeneration = (editorFieldGenerations.current[fieldId] ?? 0) + 1
      editorFieldGenerations.current[fieldId] = nextGeneration
      editorFieldAbortControllers.current.get(fieldId)?.abort()
      const controller = new AbortController()
      editorFieldAbortControllers.current.set(fieldId, controller)
      const requestedValues = values ?? currentEditorState.values
      const requestedField = nativeEditor.fields.find(
        (field) => field.fieldId === fieldId,
      )
      const dependencies =
        requestedField && "optionLoader" in requestedField
          ? requestedField.optionLoader?.dependsOn ?? []
          : []
      const dependencySignature = (projection: EditableResourceProjection) =>
        JSON.stringify(dependencies.map((dependency) => projection[dependency]))
      const signature = dependencySignature(requestedValues)
      const dependenciesChanged =
        signature !==
        (editorFieldDependencySignatures.current.get(fieldId) ??
          dependencySignature(currentEditorState.initialValues))
      editorFieldDependencySignatures.current.set(fieldId, signature)
      // Loading options does not invalidate an existing selection. Only a
      // dependency change clears it before the returned choices are known.
      const nextValues =
        dependenciesChanged && requestedField
          ? resetInvalidOptionValue(
              requestedValues,
              currentEditorState.initialValues,
              requestedField,
              [],
            )
          : requestedValues
      transitionEditor((current) => {
        if (!current || current.editorId !== editorId) return current
        const field = current.fields.find(
          (candidate) => candidate.fieldId === fieldId,
        )
        const optionFailuresByField = { ...current.optionFailuresByField }
        delete optionFailuresByField[fieldId]
        return {
          ...current,
          values:
            dependenciesChanged && field
              ? resetInvalidOptionValue(
                  current.values,
                  current.initialValues,
                  field,
                  [],
                )
              : current.values,
          optionsByField: { ...current.optionsByField, [fieldId]: [] },
          optionFailuresByField,
          loadingFieldIds: [...new Set([...current.loadingFieldIds, fieldId])],
        }
      })
      try {
        const options = await nativeEditor.loadOptions(fieldId, nextValues, {
          signal: controller.signal,
        })
        if (
          editorGeneration.current !== editorVersion ||
          editorFieldGenerations.current[fieldId] !== nextGeneration
        )
          return
        transitionEditor((current) => {
          if (!current || current.editorId !== editorId) return current
          const value = current.values[fieldId]
          const field = current.fields.find(
            (candidate) => candidate.fieldId === fieldId,
          )
          const hasInvalidOption =
            typeof value === "string"
              ? value.length > 0 &&
                !options.some((option) => option.value === value)
              : Array.isArray(value)
                ? value.some(
                    (entry) =>
                      !options.some((option) => option.value === entry),
                  )
                : false
          const valuesWithInvalidOptionCleared =
            field && hasInvalidOption
              ? resetInvalidOptionValue(
                  current.values,
                  current.initialValues,
                  field,
                  options,
                )
              : current.values
          return {
            ...current,
            values: valuesWithInvalidOptionCleared,
            optionsByField: {
              ...current.optionsByField,
              [fieldId]: options,
            },
            optionFailuresByField: {
              ...current.optionFailuresByField,
              [fieldId]: undefined,
            },
            loadingFieldIds: current.loadingFieldIds.filter(
              (id) => id !== fieldId,
            ),
          }
        })
      } catch (error) {
        if (
          editorGeneration.current !== editorVersion ||
          editorFieldGenerations.current[fieldId] !== nextGeneration
        )
          return
        const failure = toFailure(error)
        transitionEditor((current) =>
          current && current.editorId === editorId
            ? {
                ...current,
                optionFailuresByField: {
                  ...current.optionFailuresByField,
                  ...(isAborted(failure) ? {} : { [fieldId]: failure }),
                },
                loadingFieldIds: current.loadingFieldIds.filter(
                  (id) => id !== fieldId,
                ),
              }
            : current,
        )
      } finally {
        if (editorFieldAbortControllers.current.get(fieldId) === controller) {
          editorFieldAbortControllers.current.delete(fieldId)
        }
      }
    },
    [
      transitionEditor,
      editorStateRef,
      editorRef,
      createdSecretRef,
      editorGeneration,
      editorFieldGenerations,
      editorFieldAbortControllers,
      editorFieldDependencySignatures,
    ],
  )
  return { loadEditorOptions }
}
