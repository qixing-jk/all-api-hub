const SECRET_FIELDS = new Set([
  "cookie",
  "set-cookie",
  "authorization",
  "proxy-authorization",
  "x-api-key",
  "api-key",
  "token",
  "access_token",
  "refresh_token",
  "api_key",
  "apikey",
  "secret",
])

/** Redact serialized evidence without changing the live values used by assertions. */
export function redactEvidence(value) {
  if (typeof value === "string")
    return value.replace(/dahl_[a-z0-9]+/gi, "[redacted]")
  if (Array.isArray(value)) return value.map(redactEvidence)
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, field]) => [
        key,
        SECRET_FIELDS.has(key.toLowerCase())
          ? "[redacted]"
          : redactEvidence(field),
      ]),
    )
  return value
}

/** Unexpected text cannot be safely classified; retain its HTTP metadata instead. */
export function redactEvidenceBody(text) {
  if (text == null || text === "") return text
  try {
    return JSON.stringify(redactEvidence(JSON.parse(text)))
  } catch {
    return "[redacted non-JSON body]"
  }
}
