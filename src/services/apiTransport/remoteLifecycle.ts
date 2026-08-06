import { RuntimeActionIds } from "~/constants/runtimeActions"
import type { ApiTransportRemoteLifecycleObserver } from "~/types/tempWindowFetch"
import {
  onRuntimeMessage,
  sendRuntimeMessage,
} from "~/utils/browser/browserApi"

interface RemoteFetchLifecycleResult {
  transportLifecycle?: unknown
}

export interface RemoteFetchLifecycleAssessment {
  readonly hasTransportLifecycle: boolean
  readonly affirmativePreDispatch: boolean
  readonly upstreamRequestDispatched?: boolean
  readonly upstreamResponseReceived?: boolean
}

type ResultEvidenceConsumer = (
  assessment: RemoteFetchLifecycleAssessment,
) => RemoteFetchLifecycleAssessment

const localResultEvidenceConsumers = new Map<
  string,
  Set<ResultEvidenceConsumer>
>()
const REMOTE_FETCH_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const REPLAY_SAFE_FETCH_METHODS = new Set(["GET", "HEAD", "OPTIONS"])
const ABSENT_REMOTE_LIFECYCLE_ASSESSMENT = Object.freeze({
  hasTransportLifecycle: false,
  affirmativePreDispatch: false,
}) satisfies RemoteFetchLifecycleAssessment
const INVALID_REMOTE_LIFECYCLE_ASSESSMENT = Object.freeze({
  hasTransportLifecycle: true,
  affirmativePreDispatch: false,
}) satisfies RemoteFetchLifecycleAssessment

/** Returns whether repeating a remotely handed-off request is side-effect safe. */
export function isReplaySafeRemoteFetch(options?: RequestInit): boolean {
  const method = options?.method?.trim().toUpperCase() || "GET"
  return REPLAY_SAFE_FETCH_METHODS.has(method)
}

/** Validates the opaque identifier carried by the lifecycle side-channel. */
function isRemoteFetchRequestId(value: unknown): value is string {
  return (
    typeof value === "string" && REMOTE_FETCH_REQUEST_ID_PATTERN.test(value)
  )
}

/** Runs observer callbacks without allowing observability to break transport. */
function notifyObserver(callback: () => void): void {
  try {
    callback()
  } catch {
    // Lifecycle callbacks are observational and must not affect transport.
  }
}

/** Snapshots each lifecycle field once before validating stateful boundaries. */
export function inspectRemoteFetchLifecycleEvidence(
  result: unknown,
): RemoteFetchLifecycleAssessment {
  if (!result || typeof result !== "object") {
    return ABSENT_REMOTE_LIFECYCLE_ASSESSMENT
  }
  const evidence = (result as RemoteFetchLifecycleResult).transportLifecycle
  if (evidence === undefined) {
    return ABSENT_REMOTE_LIFECYCLE_ASSESSMENT
  }
  if (!evidence || typeof evidence !== "object") {
    return INVALID_REMOTE_LIFECYCLE_ASSESSMENT
  }
  const evidenceFields = evidence as Record<string, unknown>
  const upstreamRequestDispatched = evidenceFields.upstreamRequestDispatched
  const upstreamResponseReceived = evidenceFields.upstreamResponseReceived
  if (
    typeof upstreamRequestDispatched !== "boolean" ||
    typeof upstreamResponseReceived !== "boolean" ||
    (upstreamResponseReceived && !upstreamRequestDispatched)
  ) {
    return INVALID_REMOTE_LIFECYCLE_ASSESSMENT
  }

  return Object.freeze({
    hasTransportLifecycle: true,
    affirmativePreDispatch:
      !upstreamRequestDispatched && !upstreamResponseReceived,
    upstreamRequestDispatched,
    upstreamResponseReceived,
  })
}

/** Returns whether a remote result proves the upstream request never started. */
export function hasAffirmativeRemoteFetchPreDispatchEvidence(
  result: unknown,
): boolean {
  return inspectRemoteFetchLifecycleEvidence(result).affirmativePreDispatch
}

/** Broadcasts dispatch from the context that is about to call upstream fetch. */
export function announceRemoteFetchDispatch(requestId: string): void {
  if (!isRemoteFetchRequestId(requestId)) return
  void sendRuntimeMessage({
    action: RuntimeActionIds.ApiTransportRemoteFetchDispatched,
    requestId,
  }).catch(() => undefined)
}

/**
 * Observes one remote fetch without serializing callbacks across contexts.
 * Final evidence covers missed broadcasts; the broadcast preserves dispatch
 * evidence when the final runtime message is lost or times out.
 */
export function observeRemoteFetchLifecycle(
  requestId: string,
  observer: ApiTransportRemoteLifecycleObserver,
): {
  markPossiblyDispatched: () => void
  applyResultEvidence: (result: unknown) => RemoteFetchLifecycleAssessment
  dispose: () => void
} {
  let disposed = false
  let dispatchObserved = false
  const notifyDispatch = () => {
    if (disposed || dispatchObserved) return
    dispatchObserved = true
    notifyObserver(observer.onDispatch)
  }
  let responseObserved = false
  const notifyResponse = () => {
    if (disposed || responseObserved) return
    responseObserved = true
    notifyObserver(observer.onResponse)
  }
  const disposeRuntimeListener = onRuntimeMessage((message) => {
    if (
      message?.action === RuntimeActionIds.ApiTransportRemoteFetchDispatched &&
      isRemoteFetchRequestId(message?.requestId) &&
      message?.requestId === requestId
    ) {
      notifyDispatch()
    }
  })
  const applyAssessment: ResultEvidenceConsumer = (assessment) => {
    if (disposed) return ABSENT_REMOTE_LIFECYCLE_ASSESSMENT
    if (assessment.upstreamRequestDispatched) notifyDispatch()
    if (assessment.upstreamResponseReceived) notifyResponse()
    return assessment
  }
  const consumers = localResultEvidenceConsumers.get(requestId) ?? new Set()
  consumers.add(applyAssessment)
  localResultEvidenceConsumers.set(requestId, consumers)

  return {
    markPossiblyDispatched: notifyDispatch,
    applyResultEvidence: (result) => {
      if (disposed) return ABSENT_REMOTE_LIFECYCLE_ASSESSMENT
      return applyAssessment(inspectRemoteFetchLifecycleEvidence(result))
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      disposeRuntimeListener()
      consumers.delete(applyAssessment)
      if (consumers.size === 0) localResultEvidenceConsumers.delete(requestId)
    },
  }
}

/** Applies evidence before an intermediate context inspects the remote result. */
export function applyLocalRemoteFetchResultEvidence(
  requestId: string,
  result: unknown,
): void {
  const consumers = localResultEvidenceConsumers.get(requestId)
  if (!consumers?.size) return
  const assessment = inspectRemoteFetchLifecycleEvidence(result)
  for (const applyEvidence of consumers) {
    applyEvidence(assessment)
  }
}
