import { FEEDBACK_SCAN_LIMITS } from "./scanLimits"

export type ScanReadIssue = "timeout" | "limit" | "unavailable"

/** Shares request and streamed-byte limits across the reads of one scan. */
export function createScanReader(
  origin: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  let requests = 0
  let bytes = 0
  const issues = new Set<ScanReadIssue>()

  const exhausted = () =>
    requests >= FEEDBACK_SCAN_LIMITS.requests ||
    bytes >= FEEDBACK_SCAN_LIMITS.bytes ||
    signal.aborted

  const read = async (url: string, headers?: HeadersInit) => {
    if (exhausted()) {
      if (!signal.aborted) issues.add("limit")
      throw new Error("scan_limit")
    }
    const parsed = new URL(url, origin)
    if (parsed.origin !== origin || parsed.username || parsed.password)
      throw new Error("scan_origin")
    requests++
    const request = new AbortController()
    const abort = () => request.abort()
    signal.addEventListener("abort", abort, { once: true })
    const timeout = setTimeout(() => {
      issues.add("timeout")
      abort()
    }, FEEDBACK_SCAN_LIMITS.requestTimeoutMs)
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
          bytes > FEEDBACK_SCAN_LIMITS.bytes ||
          responseBytes > FEEDBACK_SCAN_LIMITS.responseBytes
        ) {
          issues.add("limit")
          throw new Error("scan_limit")
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
        bytes <= FEEDBACK_SCAN_LIMITS.bytes &&
        responseBytes <= FEEDBACK_SCAN_LIMITS.responseBytes
      )
        issues.add("unavailable")
      throw error
    } finally {
      await reader?.cancel().catch(() => undefined)
      request.abort()
      clearTimeout(timeout)
      signal.removeEventListener("abort", abort)
    }
  }
  return {
    read,
    exhausted,
    issues,
  }
}
