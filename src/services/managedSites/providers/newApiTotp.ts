import * as OTPAuth from "otpauth"

export const NEW_API_TOTP_DIGITS = 6
export const NEW_API_TOTP_PERIOD_SECONDS = 30

const normalizeNewApiTotpSecret = (secret: string) =>
  secret.trim().replace(/\s+/g, "").toUpperCase()

export const hasNewApiTotpSecret = (secret?: string | null) =>
  normalizeNewApiTotpSecret(secret ?? "").length > 0

/**
 * Generate a current RFC 6238 TOTP code from a Base32 secret using the
 * conventional SHA1 / 6-digit / 30-second settings most New API deployments
 * follow for authenticator apps.
 */
export function generateNewApiTotpCode(secret: string): string {
  const normalizedSecret = normalizeNewApiTotpSecret(secret)

  if (!normalizedSecret) {
    throw new Error("new_api_totp_secret_missing")
  }

  const totp = new OTPAuth.TOTP({
    algorithm: "SHA1",
    digits: NEW_API_TOTP_DIGITS,
    period: NEW_API_TOTP_PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(normalizedSecret),
  })

  return totp.generate()
}
