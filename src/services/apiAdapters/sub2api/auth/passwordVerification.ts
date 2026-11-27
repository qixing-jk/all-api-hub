import { fetchApiResponse } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { solveSha256PrefixBase36LeadingZeros } from "~/services/securityVerification/pow/sha256PrefixBase36LeadingZeros"
import { isRecord } from "~/utils/core/object"
import { t } from "~/utils/i18n/core"

const LOCAL_PASSWORD_VERIFICATION_TIMEOUT_MS = 45_000

/** A matched local verification challenge could not be completed safely. */
export class Sub2ApiPasswordVerificationError extends Error {
  constructor() {
    super(t("messages:errors.api.browserBackgroundVerificationFailed"))
    this.name = "Sub2ApiPasswordVerificationError"
  }
}

/** Wire contract from ZQuant's CaptchaChallenge and sitePow bundles (2026-11-23). */
export async function fetchSub2ApiLocalPasswordVerification(
  request: ApiServiceRequest,
): Promise<string | null> {
  const startedAt = Date.now()
  const response = await fetchApiResponse(request, {
    endpoint: "/api/v1/auth/security-challenge",
    options: {
      method: "POST",
      body: JSON.stringify({ purpose: "login" }),
      credentials: "omit",
      redirect: "error",
    },
  })
  // A deployment may use a native CAPTCHA instead of this optional protocol.
  if (response.status === 404 || response.status === 405) return null
  const envelope = response.body
  if (!isRecord(envelope) || !isRecord(envelope.data)) return null
  const challenge = envelope.data
  if (challenge.provider !== "local_pow") return null
  if (
    !response.ok ||
    envelope.code !== 0 ||
    challenge.bits !== 16 ||
    typeof challenge.prefix !== "string" ||
    typeof challenge.ticket !== "string" ||
    !challenge.ticket.startsWith("spow1_") ||
    challenge.ticket.length > 2048 ||
    typeof challenge.expires_in !== "number" ||
    !Number.isFinite(challenge.expires_in) ||
    challenge.expires_in <= 0
  )
    throw new Sub2ApiPasswordVerificationError()

  const deadline = Math.min(
    startedAt + challenge.expires_in * 1000,
    startedAt + LOCAL_PASSWORD_VERIFICATION_TIMEOUT_MS,
  )
  try {
    const nonce = await solveSha256PrefixBase36LeadingZeros({
      prefix: challenge.prefix,
      leadingZeroBits: challenge.bits,
      deadline,
      abortSignal: request.abortSignal,
    })
    return `${challenge.ticket}.${nonce}`
  } catch {
    request.abortSignal?.throwIfAborted()
    // Once local_pow is matched, even runtime failures belong to verification;
    // they cannot select an unrelated native login through optional discovery.
    throw new Sub2ApiPasswordVerificationError()
  }
}
