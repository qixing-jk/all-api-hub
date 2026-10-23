import { experimental_getVideoStatus, experimental_startVideo } from "ai"

import { createHeaderOverrideFetch } from "~/services/apiTransport/headerOverrides"
import { isRecord } from "~/utils/core/object"

import { getOpenAiProtocolUnsupportedResult } from "../probeProtocol"
import { nowMs, okLatency } from "../probeTiming"
import { createGoogleProvider } from "../providers"
import {
  API_TYPES,
  API_VERIFICATION_MEDIA_TYPES,
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
  type ApiVerificationProbeResult,
} from "../types"
import {
  buildSafeProbeFailureDiagnostics,
  isAbortError,
  toSanitizedErrorSummary,
} from "../utils"
import {
  getProbeUrl,
  postProbeJson,
  PROBE_PATHS,
  type ModelProbeParams,
} from "./probeTransport"

const VIDEO_TASK_STATUSES = {
  Completed: "completed",
  Succeeded: "succeeded",
  Success: "success",
  Accepted: "accepted",
  Submitted: "submitted",
  Pending: "pending",
  Queued: "queued",
  InProgress: "in_progress",
  Processing: "processing",
  Running: "running",
  Error: "error",
} as const
const COMPLETED_STATUSES = new Set<string>([
  VIDEO_TASK_STATUSES.Completed,
  VIDEO_TASK_STATUSES.Succeeded,
  VIDEO_TASK_STATUSES.Success,
])
const PENDING_STATUSES = new Set<string>([
  VIDEO_TASK_STATUSES.Accepted,
  VIDEO_TASK_STATUSES.Submitted,
  VIDEO_TASK_STATUSES.Pending,
  VIDEO_TASK_STATUSES.Queued,
  VIDEO_TASK_STATUSES.InProgress,
  VIDEO_TASK_STATUSES.Processing,
  VIDEO_TASK_STATUSES.Running,
])
const VIDEO_POLL_INTERVAL_MS = 2_000
const VIDEO_TIMEOUT_MS = 120_000

/** Normalize the documented task envelope and compatible nested responses. */
function readTask(value: unknown) {
  const data = isRecord(value) ? value : {}
  const task = isRecord(data.data) ? data.data : data
  const id = data.id ?? data.task_id ?? task.id ?? task.task_id
  const url = data.url ?? data.video_url ?? task.url ?? task.video_url
  return {
    id: typeof id === "string" ? id.trim() : "",
    status:
      typeof (data.status ?? task.status) === "string"
        ? String(data.status ?? task.status).toLowerCase()
        : "",
    url: typeof url === "string" && /^https?:\/\//i.test(url) ? url : undefined,
    error: Boolean(data.error || task.error),
  }
}

/** Keep SDK-added Google API keys out of diagnostic output and saved history. */
function omitGoogleApiKey(
  url: string | undefined,
  apiKey: string,
): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.searchParams.get("key") === apiKey) {
      parsed.searchParams.delete("key")
    }
    return parsed.toString()
  } catch {
    return null
  }
}

/** Wait between status reads, releasing both the timer and listener on cancellation. */
function waitForNextPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted()
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, VIDEO_POLL_INTERVAL_MS)
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

/**
 * Video generation probe: submits a task using the provider's default duration to verify
 * authentication, completion, and a playable result with a two-minute wait limit.
 */
export async function runVideoGenerationProbe(
  params: ModelProbeParams,
): Promise<ApiVerificationProbeResult> {
  const startedAt = nowMs()
  const unsupported =
    params.apiType === API_TYPES.GOOGLE
      ? undefined
      : getOpenAiProtocolUnsupportedResult(
          params,
          API_VERIFICATION_PROBE_IDS.VideoGeneration,
          startedAt,
        )
  if (unsupported) return unsupported
  const secretsToRedact = [
    params.apiKey,
    ...Object.values(params.requestHeaders ?? {}),
  ]

  const controller = new AbortController()
  const onAbort = () => controller.abort(params.abortSignal?.reason)
  params.abortSignal?.addEventListener("abort", onAbort, { once: true })
  if (params.abortSignal?.aborted) onAbort()
  let timedOut = false
  let taskId: string | undefined
  let taskStatus: string | undefined
  let taskFailed = false
  let videoUrl: string | undefined
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort(
      new DOMException("Video generation timed out", "TimeoutError"),
    )
  }, VIDEO_TIMEOUT_MS)

  try {
    controller.signal.throwIfAborted()
    if (params.apiType === API_TYPES.GOOGLE) {
      const provider = createGoogleProvider(params)
      const model = provider.videoModel(params.modelId)
      const { operation } = await experimental_startVideo({
        model,
        prompt:
          "A simple geometric shape rotates slowly on a plain background.",
        n: 1,
        maxRetries: 0,
        abortSignal: controller.signal,
      })
      const operationName =
        operation &&
        typeof operation === "object" &&
        "operationName" in operation &&
        typeof operation.operationName === "string"
          ? operation.operationName
          : undefined
      taskId = operationName

      while (taskId) {
        controller.signal.throwIfAborted()
        const result = await experimental_getVideoStatus(model, {
          operation,
          maxRetries: 0,
          abortSignal: controller.signal,
        })
        taskStatus = result.status
        if (result.status === VIDEO_TASK_STATUSES.Pending) {
          await waitForNextPoll(controller.signal)
          continue
        }
        taskFailed = result.status === VIDEO_TASK_STATUSES.Error
        videoUrl =
          result.status === VIDEO_TASK_STATUSES.Completed
            ? result.videos.find((video) => video.type === "url")?.url
            : undefined
        break
      }
    } else {
      const url = getProbeUrl(params, PROBE_PATHS.Video)
      const body = {
        model: params.modelId,
        prompt: "test",
      }

      const customFetch =
        createHeaderOverrideFetch(params.requestHeaders) ?? fetch
      let task = readTask(
        await postProbeJson(
          { ...params, abortSignal: controller.signal },
          PROBE_PATHS.Video,
          body,
        ),
      )
      taskId = task.id || undefined
      // A POST is never retried here: status polling must not create another paid task.
      while (
        !task.error &&
        taskId &&
        (!task.status || PENDING_STATUSES.has(task.status))
      ) {
        controller.signal.throwIfAborted()
        const pollResponse = await customFetch(
          `${url}/${encodeURIComponent(taskId)}`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${params.apiKey}` },
            signal: controller.signal,
          },
        )
        if (!pollResponse.ok) {
          throw new Error(
            `HTTP ${pollResponse.status} ${pollResponse.statusText}`,
          )
        }
        task = readTask(await pollResponse.json().catch(() => null))
        taskStatus = task.status
        if (task.error || !PENDING_STATUSES.has(task.status)) break
        await waitForNextPoll(controller.signal)
      }
      taskStatus = task.status
      taskFailed = task.error
      videoUrl = task.url
    }

    controller.signal.throwIfAborted()
    const completed = !taskFailed && COMPLETED_STATUSES.has(taskStatus ?? "")
    const playable = completed && Boolean(videoUrl)

    return {
      id: API_VERIFICATION_PROBE_IDS.VideoGeneration,
      status: playable
        ? API_VERIFICATION_PROBE_STATUSES.Pass
        : API_VERIFICATION_PROBE_STATUSES.Fail,
      latencyMs: okLatency(startedAt),
      summary: playable
        ? "Video generated successfully"
        : "Video task failed or returned an invalid response",
      summaryKey: playable
        ? "verifyDialog.summaries.videoGenerationSucceeded"
        : completed
          ? "verifyDialog.summaries.videoNoPlayableResult"
          : "verifyDialog.summaries.videoUnexpectedResponse",
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
      },
      output: {
        taskId: taskId ?? null,
        status: taskStatus ?? null,
        url:
          params.apiType === API_TYPES.GOOGLE
            ? omitGoogleApiKey(videoUrl, params.apiKey)
            : videoUrl ?? null,
      },
      media: playable
        ? { type: API_VERIFICATION_MEDIA_TYPES.Video, url: videoUrl! }
        : undefined,
      details: taskId ? { taskId } : undefined,
    }
  } catch (error) {
    if (!timedOut && isAbortError(error, params.abortSignal)) {
      throw error
    }

    const summary = toSanitizedErrorSummary(error, secretsToRedact)
    const diagnostics = buildSafeProbeFailureDiagnostics(error, summary)

    return {
      id: API_VERIFICATION_PROBE_IDS.VideoGeneration,
      status: API_VERIFICATION_PROBE_STATUSES.Fail,
      latencyMs: okLatency(startedAt),
      summary,
      summaryKey: timedOut
        ? "verifyDialog.summaries.videoGenerationTimedOut"
        : diagnostics.summaryKey,
      summaryParams: diagnostics.summaryParams,
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
      },
      output: {
        ...diagnostics.output,
        taskId: taskId ?? null,
        status: taskStatus ?? null,
      },
    }
  } finally {
    clearTimeout(timeout)
    params.abortSignal?.removeEventListener("abort", onAbort)
  }
}
