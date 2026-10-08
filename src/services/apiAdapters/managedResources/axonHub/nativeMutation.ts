import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import { type AxonHubNativeChannelPatch } from "~/services/apiAdapters/managedResources/axonHub/editorContracts"
import {
  type AxonHubMutationStepResult,
  type AxonHubNativeFailure,
} from "~/services/apiAdapters/managedResources/axonHub/nativeContracts"
import {
  AxonHubNativeError,
  createControlledNativeFailure,
  isAxonHubNativeFailure,
  mapRequestFailure,
} from "~/services/apiAdapters/managedResources/axonHub/nativeRuntime"
import { AxonHubRequestError } from "~/services/apiService/axonHub/graphqlProtocol"
import {
  type ManagedSiteMutationConfirmedEffect,
  type ManagedSiteMutationSequence,
} from "~/services/managedSites/mutations"
import type {
  AxonHubChannel,
  AxonHubChannelMutationReceipt,
} from "~/types/axonHub"

export const channelMutationEffect = (
  kind: ManagedSiteMutationConfirmedEffect["kind"],
  resourceId: string,
): ManagedSiteMutationConfirmedEffect => ({
  kind,
  resourceKind: MANAGED_RESOURCE_KINDS.Channel,
  resourceId,
})

const mutationDiagnostic = (failure: AxonHubNativeFailure, error: unknown) => ({
  message: failure.code,
  code: failure.code,
  raw: error,
})

const isTypedAbort = (error: unknown): error is DOMException =>
  error instanceof DOMException && error.name === "AbortError"

const classifyMutationFailure = (
  error: unknown,
  bareAbortDispatch: AxonHubNativeFailure["dispatch"],
): { failure: AxonHubNativeFailure; error: unknown } => {
  if (
    error instanceof AxonHubNativeError &&
    isAxonHubNativeFailure(error.failure)
  ) {
    return { failure: error.failure, error }
  }
  if (error instanceof AxonHubRequestError) {
    return { failure: mapRequestFailure(error).failure, error }
  }
  if (isTypedAbort(error)) {
    return {
      failure: createControlledNativeFailure("aborted", bareAbortDispatch),
      error,
    }
  }
  throw error
}

export const runAxonHubNativeMutationStep = async <TData>(input: {
  sequence: ManagedSiteMutationSequence<ManagedSiteMutationConfirmedEffect>
  effect: (data: TData) => ManagedSiteMutationConfirmedEffect
  execute(): Promise<TData>
  signal?: AbortSignal
  rejectResponse?: (data: TData) => AxonHubNativeError | undefined
  convergeFailure?: (
    failure: AxonHubNativeFailure,
  ) => { data: TData } | undefined
}): Promise<AxonHubMutationStepResult<TData>> => {
  const attempt = input.sequence.beginStep()
  if (input.signal?.aborted) {
    const error =
      input.signal.reason ??
      new DOMException("The operation was aborted", "AbortError")
    const failure = createControlledNativeFailure("aborted", "before")
    attempt.complete()
    return {
      outcome: "rejected",
      diagnostic: mutationDiagnostic(failure, error),
    }
  }
  try {
    const data = await input.execute()
    attempt.markPossiblyDispatched()
    attempt.markResponseReceived()
    const rejection = input.rejectResponse?.(data)
    if (rejection) {
      attempt.confirmNonApplication()
      attempt.complete()
      return {
        outcome: "rejected",
        diagnostic: mutationDiagnostic(rejection.failure, rejection),
      }
    }
    attempt.confirmEffect(input.effect(data))
    attempt.complete()
    return { outcome: "applied", data }
  } catch (error) {
    const classified = classifyMutationFailure(error, "after")
    if (classified.failure.dispatch === "after") {
      attempt.markPossiblyDispatched()
    }
    if (
      classified.failure.code === "not_found" &&
      classified.failure.dispatch === "after"
    ) {
      attempt.markResponseReceived()
      attempt.confirmNonApplication()
    }
    attempt.complete()
    const convergence = input.convergeFailure?.(classified.failure)
    if (convergence) {
      return { outcome: "applied", data: convergence.data }
    }
    return {
      outcome:
        classified.failure.dispatch === "before" ||
        classified.failure.code === "not_found"
          ? "rejected"
          : "uncertain",
      diagnostic: mutationDiagnostic(classified.failure, classified.error),
    }
  }
}

export const finishAxonHubNativeMutation = <TData>(
  sequence: ManagedSiteMutationSequence<ManagedSiteMutationConfirmedEffect>,
  step: Exclude<AxonHubMutationStepResult<unknown>, { outcome: "applied" }>,
  data?: TData,
) =>
  sequence.finish({
    finalState: "unconfirmed",
    ...(data === undefined ? {} : { data }),
    diagnostic: step.diagnostic,
  })

export const omitAxonHubChannelCredentials = (
  channel: AxonHubChannel,
): AxonHubChannel => {
  const credentialFreeChannel = { ...channel }
  delete credentialFreeChannel.credentials
  return credentialFreeChannel
}

export const applyAxonHubNativeChannelPatch = (
  detail: AxonHubChannel,
  input: Omit<AxonHubNativeChannelPatch, "status">,
  receipt: AxonHubChannelMutationReceipt,
): AxonHubChannel => {
  const { clearAutoSyncModelPattern, clearRemark, ...changedValues } = input
  return {
    ...detail,
    ...changedValues,
    ...receipt,
    ...(clearAutoSyncModelPattern ? { autoSyncModelPattern: null } : {}),
    ...(clearRemark ? { remark: null } : {}),
  }
}
