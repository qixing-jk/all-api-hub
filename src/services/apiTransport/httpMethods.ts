const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

/** Tests an already normalized method without changing the caller's input policy. */
export function isSafeHttpMethod(method: string): boolean {
  return SAFE_HTTP_METHODS.has(method)
}
