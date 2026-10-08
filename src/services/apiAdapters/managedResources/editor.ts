import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type EditableResourceProjection,
  type ResourceDisplayFacts,
  type ResourceEditor,
  type ResourceFailure,
  type ResourceFieldDescriptor,
  type ResourceFieldOption,
  type ResourceOperationOptions,
  type ResourceValidationResult,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  mapOperationFailure,
  toManagedError,
} from "~/services/apiAdapters/managedResources/failures"
import { createEditorSubmissionLifecycle } from "~/services/apiAdapters/nativeResources/editorSubmissionLifecycle"
import {
  assertManagedSiteMutationResult,
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationConfirmedEffect,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations/contracts"

export type NativeResourceEditorDefinition<TCommand> = {
  fields: readonly ResourceFieldDescriptor[]
  initialValues: EditableResourceProjection
  validate(values: EditableResourceProjection): ResourceValidationResult
  buildCommand(values: EditableResourceProjection): TCommand
  loadSecret?: (
    fieldId: string,
    options?: ResourceOperationOptions,
  ) => Promise<string>
  loadOptions?: (
    fieldId: string,
    values: EditableResourceProjection,
    options?: ResourceOperationOptions,
  ) => Promise<readonly ResourceFieldOption[]>
}

const rejectedPublicInput = <T>(): ManagedSiteMutationResult<T> => ({
  outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
  diagnostic: { message: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed },
})

/** Adapts native editing to the managed mutation result and terminal submission contract. */
export function createManagedResourceEditor<TCommand, TDetail>(
  editorDefinition: NativeResourceEditorDefinition<TCommand>,
  mutate: (
    command: TCommand,
    options?: ResourceOperationOptions,
  ) => Promise<ManagedSiteMutationResult<TDetail>>,
  projectResult: (detail: TDetail) => ResourceDisplayFacts,
  mutationOptions: { idempotent: boolean },
  mapFailure: (error: unknown) => ResourceFailure,
): ResourceEditor {
  const closeForTerminalFailure = (
    error: ManagedResourceError,
    close: () => void,
  ) => {
    if (
      error.failure.code === MANAGED_RESOURCE_FAILURE_CODES.NotFound ||
      error.failure.code ===
        MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain
    ) {
      close()
    }
  }

  const validate = (values: EditableResourceProjection) => {
    try {
      return editorDefinition.validate(values)
    } catch (error) {
      throw toManagedError(error, mapFailure)
    }
  }

  const { submit } = createEditorSubmissionLifecycle<
    EditableResourceProjection,
    ResourceOperationOptions,
    ManagedSiteMutationResult<ResourceDisplayFacts>
  >({
    onClosed: () =>
      Promise.resolve(rejectedPublicInput<ResourceDisplayFacts>()),
    execute: async (values, submitOptions, close) => {
      const validation = validate(values)
      if (!validation.valid) return rejectedPublicInput<ResourceDisplayFacts>()
      let command: TCommand
      try {
        command = editorDefinition.buildCommand(values)
      } catch (error) {
        const managedError = toManagedError(error, mapFailure)
        closeForTerminalFailure(managedError, close)
        throw managedError
      }

      let candidate: unknown
      try {
        candidate = await mutate(command, submitOptions)
      } catch (error) {
        if (error instanceof ManagedResourceError) {
          closeForTerminalFailure(error, close)
        } else {
          close()
        }
        throw error
      }

      try {
        assertManagedSiteMutationResult<
          TDetail,
          ManagedSiteMutationConfirmedEffect
        >(candidate, mutationOptions)
      } catch (error) {
        close()
        throw error
      }
      const result = candidate
      if (result.outcome !== MANAGED_SITE_MUTATION_OUTCOMES.Rejected) {
        close()
      }

      switch (result.outcome) {
        case MANAGED_SITE_MUTATION_OUTCOMES.Succeeded:
          return { ...result, data: projectResult(result.data) }
        case MANAGED_SITE_MUTATION_OUTCOMES.Partial:
          if (result.data === undefined) {
            // No provider detail crosses the public boundary in this
            // branch, so the checked envelope is already public-safe.
            return result as ManagedSiteMutationResult<ResourceDisplayFacts>
          }
          return { ...result, data: projectResult(result.data) }
        case MANAGED_SITE_MUTATION_OUTCOMES.Rejected:
        case MANAGED_SITE_MUTATION_OUTCOMES.Uncertain:
          return result
      }
    },
  })

  const loadSecretCallback = editorDefinition.loadSecret
  const loadOptionsCallback = editorDefinition.loadOptions
  return {
    fields: editorDefinition.fields,
    initialValues: editorDefinition.initialValues,
    validate,
    ...(loadSecretCallback
      ? {
          loadSecret: (
            fieldId: string,
            operationOptions?: ResourceOperationOptions,
          ) =>
            mapOperationFailure(
              () => loadSecretCallback(fieldId, operationOptions),
              mapFailure,
            ),
        }
      : {}),
    ...(loadOptionsCallback
      ? {
          loadOptions: (
            fieldId: string,
            values: EditableResourceProjection,
            operationOptions?: ResourceOperationOptions,
          ) =>
            mapOperationFailure(
              () => loadOptionsCallback(fieldId, values, operationOptions),
              mapFailure,
            ),
        }
      : {}),
    submit,
  }
}
