import { sanitizeUrlForLog } from "~/utils/core/sanitizeUrlForLog"

const REDACTED = "[REDACTED]"
const BEARER_PATTERN = /\bBearer\s+[-A-Za-z0-9._~+/]+=*/gi
const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{10,}\b/gi

/**
 * Best-effort cleanup for common secret-bearing text shapes.
 * Callers should still redact secrets they already know by exact value.
 */
export function sanitizeSensitiveErrorText(text: string): string {
  return text
    .replace(/https?:\/\/[^\s"'<>]+/gi, (url) => sanitizeUrlForLog(url))
    .replace(BEARER_PATTERN, `Bearer ${REDACTED}`)
    .replace(OPENAI_KEY_PATTERN, REDACTED)
    .replace(/\b((?:set-)?cookie)\s*:\s*[^\r\n]+/gi, `$1: ${REDACTED}`)
    .replace(/\b(authorization)\s*:\s*[^\r\n]+/gi, `$1: ${REDACTED}`)
    .replace(/\b(authorization)\s*=\s*[^\r\n]+/gi, `$1=${REDACTED}`)
    .replace(
      /\b(token|access[\s_-]?token|refresh[\s_-]?token|admin[\s_-]?token|api[\s_-]?key|key|password|passwd|secret|client[\s_-]?secret|management[\s_-]?key)\s*[:=]\s*[^\s,&;]+/gi,
      `$1=${REDACTED}`,
    )
}
