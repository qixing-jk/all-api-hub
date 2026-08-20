import type {
  ApiServiceRequest,
  ApiTransportRequestObserver,
} from "~/services/apiTransport/type"
import {
  runManagedSiteMutationStep,
  type ManagedSiteMutationConfirmedEffect,
  type ManagedSiteMutationDiagnostic,
  type ManagedSiteMutationSequence,
  type ManagedSiteMutationStepRunResult,
} from "~/services/managedSites/mutations"
import { AuthTypeEnum } from "~/types"

type ManagedSiteApiServiceConfig = {
  baseUrl: string
  adminToken: string
  userId: string
}

type ManagedSiteApiServiceRequestOptions = {
  signal?: AbortSignal | null
  bypassSiteRequestLimit?: boolean
  observer?: ApiTransportRequestObserver
}

/**
 * Converts persisted managed-site admin config into an API-service request.
 */
export function toManagedSiteApiServiceRequest(
  config: ManagedSiteApiServiceConfig,
  options?: ManagedSiteApiServiceRequestOptions,
) {
  return {
    baseUrl: config.baseUrl,
    auth: {
      authType: AuthTypeEnum.AccessToken,
      accessToken: config.adminToken,
      userId: config.userId,
    },
    ...(options?.signal ? { abortSignal: options.signal } : {}),
    ...(options?.bypassSiteRequestLimit
      ? { bypassSiteRequestLimit: true }
      : {}),
    ...(options?.observer ? { observer: options.observer } : {}),
  }
}

type ManagedSiteApiServiceMutationAttempt<TResponse> =
  | { kind: "response"; response: TResponse }
  | { kind: "response-error"; error: unknown }

/** Builds the common confirmed-effect shape for managed channel writes. */
export const createManagedSiteChannelEffect = (
  kind: ManagedSiteMutationConfirmedEffect["kind"],
  resourceId?: string | number,
): ManagedSiteMutationConfirmedEffect => ({
  kind,
  resourceKind: "channel",
  ...(resourceId === undefined ? {} : { resourceId }),
})

/** Completes a single-step provider mutation from its common step result. */
export const finishManagedSiteMutationStep = <TData>(
  sequence: ManagedSiteMutationSequence<ManagedSiteMutationConfirmedEffect>,
  step: ManagedSiteMutationStepRunResult<TData>,
) =>
  step.outcome === "applied"
    ? sequence.finish({ finalState: "confirmed", data: step.data })
    : sequence.finish({
        finalState: "unconfirmed",
        diagnostic: step.diagnostic,
      })

/**
 * Runs one REST mutation while preserving transport lifecycle evidence for the
 * provider-owned response and response-error classifiers.
 */
export async function runManagedSiteApiServiceMutationStep<
  TEffect extends ManagedSiteMutationConfirmedEffect,
  TResponse,
  TData,
>(input: {
  config: ManagedSiteApiServiceConfig
  options?: Omit<ManagedSiteApiServiceRequestOptions, "observer">
  sequence: ManagedSiteMutationSequence<TEffect>
  effect: NoInfer<TEffect>
  execute(request: ApiServiceRequest): Promise<TResponse>
  classifyResponse(
    response: TResponse,
  ):
    | { outcome: "applied"; data: TData }
    | { outcome: "rejected"; diagnostic: ManagedSiteMutationDiagnostic }
  classifyResponseError(error: unknown): {
    outcome: "rejected"
    diagnostic: ManagedSiteMutationDiagnostic
  }
}): Promise<ManagedSiteMutationStepRunResult<TData>> {
  return await runManagedSiteMutationStep({
    sequence: input.sequence,
    effect: input.effect,
    execute: async (observer) => {
      let responseReceived = false
      const requestObserver: ApiTransportRequestObserver = {
        onDispatch: observer.onDispatch,
        onResponse() {
          responseReceived = true
          observer.onResponse()
        },
      }

      try {
        return {
          kind: "response",
          response: await input.execute(
            toManagedSiteApiServiceRequest(input.config, {
              ...input.options,
              observer: requestObserver,
            }),
          ),
        } satisfies ManagedSiteApiServiceMutationAttempt<TResponse>
      } catch (error) {
        if (!responseReceived) throw error
        return {
          kind: "response-error",
          error,
        } satisfies ManagedSiteApiServiceMutationAttempt<TResponse>
      }
    },
    classifyResponse: (attempt) =>
      attempt.kind === "response"
        ? input.classifyResponse(attempt.response)
        : input.classifyResponseError(attempt.error),
  })
}
