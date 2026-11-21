import type {
  AccountKeyEditorSubmitResult,
  AccountKeyResourceEditor,
  EditableResourceProjection,
  ResourceFailure,
  ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  AccountKeyResourceError,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { NATIVE_RESOURCE_MUTATION_CERTAINTIES } from "~/services/apiAdapters/contracts/resourceNative"
import {
  createNativeEditorSubmitGate,
  isNativeResourceBoundaryError,
  NATIVE_RESOURCE_MUTATION_RESOLUTION_STATUSES,
  resolveNativeResourceMutation,
  type NativeResourceMutationResult,
} from "~/services/apiAdapters/nativeResources/factory"

import type { AccountKeyResourceEditorDefinition } from "./definition"
import {
  mapMutationOperation,
  mapOperation,
  toAccountKeyResourceError,
  unexpectedFailure,
  validationFailure,
} from "./operationErrors"
import { normalizeValidationResult } from "./validation"

/** Binds validated fields, option reads and mutation certainty to the existing submit gate. */
export function createAccountKeyResourceEditor<
  TCommand,
  TMutationValue,
  TFailure,
>(options: {
  mapFailure: (error: unknown) => ResourceFailure
  editorDefinition: AccountKeyResourceEditorDefinition<TCommand>
  resolveDestinationScopeKey(values: EditableResourceProjection): string
  mutate(
    command: TCommand,
    submitOptions?: ResourceOperationOptions,
  ): Promise<NativeResourceMutationResult<TMutationValue, TFailure>>
  projectApplied(value: TMutationValue): AccountKeyEditorSubmitResult
}): AccountKeyResourceEditor {
  const { editorDefinition, mapFailure } = options
  const validate = (values: EditableResourceProjection) => {
    try {
      return normalizeValidationResult(editorDefinition.validate(values))
    } catch (error) {
      throw toAccountKeyResourceError(error, mapFailure)
    }
  }
  const gate = createNativeEditorSubmitGate({
    validate: (values: EditableResourceProjection) => {
      const result = validate(values)
      if (!result.valid) throw validationFailure(result.issues)
    },
    buildCommand: editorDefinition.buildCommand,
    mutate: (command, submitOptions) =>
      mapMutationOperation(
        () => options.mutate(command, submitOptions),
        mapFailure,
      ),
    resolve: (result) => {
      const resolution = resolveNativeResourceMutation(result)
      if (
        resolution.status ===
        NATIVE_RESOURCE_MUTATION_RESOLUTION_STATUSES.Applied
      ) {
        return options.projectApplied(resolution.value)
      }
      if (
        resolution.status ===
        NATIVE_RESOURCE_MUTATION_RESOLUTION_STATUSES.NotApplied
      ) {
        throw new AccountKeyResourceError(
          mapFailure(resolution.failure),
          NATIVE_RESOURCE_MUTATION_CERTAINTIES.NotApplied,
        )
      }
      const failure = mapFailure(resolution.failure)
      throw new AccountKeyResourceError({
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
        ...(failure.message ? { message: failure.message } : {}),
        ...(failure.upstreamCode ? { upstreamCode: failure.upstreamCode } : {}),
      })
    },
    normalizeError: (error) =>
      isNativeResourceBoundaryError(error)
        ? unexpectedFailure()
        : toAccountKeyResourceError(error, mapFailure),
    shouldCloseAfterError: (error) => {
      const accountError = toAccountKeyResourceError(error, mapFailure)
      return (
        accountError.failure.code ===
          ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound ||
        accountError.failure.code ===
          ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain
      )
    },
    closedError: validationFailure,
  })
  return {
    action: editorDefinition.action,
    fields: editorDefinition.fields,
    initialValues: editorDefinition.initialValues,
    validate,
    resolveDestinationScopeKey: (values) => {
      try {
        return options.resolveDestinationScopeKey(values)
      } catch (error) {
        throw toAccountKeyResourceError(error, mapFailure)
      }
    },
    ...(editorDefinition.loadOptions
      ? {
          loadOptions: (fieldId, values, loadOptions) =>
            mapOperation(
              () => editorDefinition.loadOptions!(fieldId, values, loadOptions),
              mapFailure,
            ),
        }
      : {}),
    submit: (values, submitOptions) => gate.submit(values, submitOptions),
  }
}
