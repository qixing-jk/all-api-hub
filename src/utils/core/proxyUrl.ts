import { parse } from "fast-uri"

/** Validates a non-empty proxy address without changing its submitted value. */
export function isValidProxyUrl(value: string): boolean {
  try {
    // Chrome before 130 leaves non-special URL hosts empty, rejecting SOCKS:
    // https://issues.chromium.org/issues/40283413
    // domainHost also validates DNS/IDN hosts, using HTTP parsing where needed.
    const uri = parse(value.trim(), { domainHost: true })
    return (
      !uri.error &&
      Boolean(uri.host) &&
      ["http", "https", "socks5", "socks5h"].includes(uri.scheme ?? "")
    )
  } catch {
    return false
  }
}
