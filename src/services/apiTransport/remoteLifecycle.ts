import { RuntimeActionIds } from "~/constants/runtimeActions"
import type {
  ApiTransportRemoteLifecycleEvidence,
  ApiTransportRemoteLifecycleObserver,
} from "~/types/tempWindowFetch"
import {
  onRuntimeMessage,
  sendRuntimeMessage,
} from "~/utils/browser/browserApi"

interface RemoteFetchLifecycleResult {
  transportLifecycle?: unknown
}

type ResultEvidenceConsumer = (
  result: RemoteFetchLifecycleResult | null,
) => void

const localResultEvidenceConsumers = new Map<
  string,
  Set<ResultEvidenceConsumer>
>()
const REMOTE_FETCH_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

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

/** Validates the controlled final evidence shape returned by a remote context. */
function isRemoteLifecycleEvidence(
  value: unknown,
): value is ApiTransportRemoteLifecycleEvidence {
  if (!value || typeof value !== "object") return false
  const evidence = value as Record<string, unknown>
  return (
    typeof evidence.upstreamRequestDispatched === "boolean" &&
    typeof evidence.upstreamResponseReceived === "boolean" &&
    !(
      evidence.upstreamResponseReceived === true &&
      evidence.upstreamRequestDispatched === false
    )
  )
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
  applyResultEvidence: (result: RemoteFetchLifecycleResult | null) => void
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
  const applyResultEvidence: ResultEvidenceConsumer = (result) => {
    if (disposed) return
    const evidence = result?.transportLifecycle
    if (!isRemoteLifecycleEvidence(evidence)) return
    if (evidence.upstreamRequestDispatched) notifyDispatch()
    if (evidence.upstreamResponseReceived) notifyResponse()
  }
  const consumers = localResultEvidenceConsumers.get(requestId) ?? new Set()
  consumers.add(applyResultEvidence)
  localResultEvidenceConsumers.set(requestId, consumers)

  return {
    applyResultEvidence,
    dispose: () => {
      if (disposed) return
      disposed = true
      disposeRuntimeListener()
      consumers.delete(applyResultEvidence)
      if (consumers.size === 0) localResultEvidenceConsumers.delete(requestId)
    },
  }
}

/** Applies evidence before an intermediate context inspects the remote result. */
export function applyLocalRemoteFetchResultEvidence(
  requestId: string,
  result: RemoteFetchLifecycleResult | null,
): void {
  for (const applyEvidence of localResultEvidenceConsumers.get(requestId) ??
    []) {
    applyEvidence(result)
  }
}
