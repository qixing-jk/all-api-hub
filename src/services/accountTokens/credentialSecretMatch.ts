export const KEY_CREDENTIAL_SECRET_MATCHES = {
  Exact: "exact",
  Masked: "masked",
  Mismatch: "mismatch",
  Unknown: "unknown",
} as const

type KeyCredentialSecretMatch =
  (typeof KEY_CREDENTIAL_SECRET_MATCHES)[keyof typeof KEY_CREDENTIAL_SECRET_MATCHES]

const MASKED_SECRET_PATTERN = /[*•…]+|\.{3,}/g
const MINIMUM_MASKED_EVIDENCE_LENGTH = 4

/**
 * Compares a candidate credential with a target's full or partially masked key.
 * Masked fragments are useful warnings only and never prove ownership.
 */
export const compareCredentialSecret = (
  targetSecret: string | undefined,
  candidateSecret: string,
): KeyCredentialSecretMatch => {
  const target = targetSecret?.trim() ?? ""
  const candidate = candidateSecret.trim()
  if (!target || !candidate) return KEY_CREDENTIAL_SECRET_MATCHES.Unknown

  const maskedFragments = target.split(MASKED_SECRET_PATTERN).filter(Boolean)
  if (maskedFragments.length === 1 && maskedFragments[0] === target) {
    return target === candidate
      ? KEY_CREDENTIAL_SECRET_MATCHES.Exact
      : KEY_CREDENTIAL_SECRET_MATCHES.Mismatch
  }

  const visibleEvidenceLength = maskedFragments.reduce(
    (total, fragment) => total + fragment.length,
    0,
  )
  if (visibleEvidenceLength < MINIMUM_MASKED_EVIDENCE_LENGTH) {
    return KEY_CREDENTIAL_SECRET_MATCHES.Unknown
  }

  let searchStart = 0
  for (const [index, fragment] of maskedFragments.entries()) {
    const fragmentIndex = candidate.indexOf(fragment, searchStart)
    if (fragmentIndex === -1) {
      return KEY_CREDENTIAL_SECRET_MATCHES.Mismatch
    }
    if (index === 0 && target.startsWith(fragment) && fragmentIndex !== 0) {
      return KEY_CREDENTIAL_SECRET_MATCHES.Mismatch
    }
    searchStart = fragmentIndex + fragment.length
  }

  const lastFragment = maskedFragments[maskedFragments.length - 1]
  if (
    lastFragment !== undefined &&
    target.endsWith(lastFragment) &&
    !candidate.endsWith(lastFragment)
  ) {
    return KEY_CREDENTIAL_SECRET_MATCHES.Mismatch
  }

  return KEY_CREDENTIAL_SECRET_MATCHES.Masked
}
