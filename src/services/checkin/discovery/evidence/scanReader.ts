import { CHECK_IN_EVIDENCE_SCAN_LIMITS } from "./scanLimits"
import { CHECK_IN_EVIDENCE_SCAN_ERRORS } from "./scanTypes"

export const SCAN_READ_ISSUES = {
  Timeout: "timeout",
  Limit: "limit",
  Unavailable: "unavailable",
} as const

export type ScanReadIssue =
  (typeof SCAN_READ_ISSUES)[keyof typeof SCAN_READ_ISSUES]

/** Shares request and streamed-byte limits across the reads of one scan. */
export function createScanReader(
  origin: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  statusOrigin = origin,
) {
  let requests = 0
  let bytes = 0
  const issues = new Set<ScanReadIssue>()

  const exhausted = () =>
    requests >= CHECK_IN_EVIDENCE_SCAN_LIMITS.requests ||
    bytes >= CHECK_IN_EVIDENCE_SCAN_LIMITS.bytes ||
    signal.aborted

  const readFromOrigin = async (
    allowedOrigin: string,
    url: string,
    headers?: HeadersInit,
  ) => {
    if (exhausted()) {
      if (!signal.aborted) issues.add(SCAN_READ_ISSUES.Limit)
      throw new Error(CHECK_IN_EVIDENCE_SCAN_ERRORS.Limit)
    }
    const parsed = new URL(url, allowedOrigin)
    if (parsed.origin !== allowedOrigin || parsed.username || parsed.password)
      throw new Error(CHECK_IN_EVIDENCE_SCAN_ERRORS.Origin)
    requests++
    const request = new AbortController()
    const abort = () => request.abort()
    signal.addEventListener("abort", abort, { once: true })
    const timeout = setTimeout(() => {
      issues.add(SCAN_READ_ISSUES.Timeout)
      abort()
    }, CHECK_IN_EVIDENCE_SCAN_LIMITS.requestTimeoutMs)
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    let responseBytes = 0
    try {
      const response = await fetcher(parsed.href, {
        method: "GET",
        headers,
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal: request.signal,
      })
      reader = response.body?.getReader()
      if (!reader)
        return {
          status: response.status,
          text: "",
          type: response.headers.get("content-type") ?? "",
        }
      const decoder = new TextDecoder()
      let text = ""
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes += chunk.value.byteLength
        responseBytes += chunk.value.byteLength
        if (
          bytes > CHECK_IN_EVIDENCE_SCAN_LIMITS.bytes ||
          responseBytes > CHECK_IN_EVIDENCE_SCAN_LIMITS.responseBytes
        ) {
          issues.add(SCAN_READ_ISSUES.Limit)
          throw new Error(CHECK_IN_EVIDENCE_SCAN_ERRORS.Limit)
        }
        text += decoder.decode(chunk.value, { stream: true })
      }
      return {
        status: response.status,
        text: text + decoder.decode(),
        type: response.headers.get("content-type") ?? "",
      }
    } catch (error) {
      if (
        !request.signal.aborted &&
        bytes <= CHECK_IN_EVIDENCE_SCAN_LIMITS.bytes &&
        responseBytes <= CHECK_IN_EVIDENCE_SCAN_LIMITS.responseBytes
      )
        issues.add(SCAN_READ_ISSUES.Unavailable)
      throw error
    } finally {
      await reader?.cancel().catch(() => undefined)
      request.abort()
      clearTimeout(timeout)
      signal.removeEventListener("abort", abort)
    }
  }
  return {
    read: (url: string, headers?: HeadersInit) =>
      readFromOrigin(origin, url, headers),
    readStatus: (url: string, headers?: HeadersInit) =>
      readFromOrigin(statusOrigin, url, headers),
    exhausted,
    issues,
  }
}
