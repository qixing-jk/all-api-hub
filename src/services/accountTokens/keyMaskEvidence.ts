/**
 * Adapter opt-in evidence: prefix starts at character zero and suffix ends at
 * the last character of the SAME original credential. Confirm the source
 * field's semantics before publishing; mask-like syntax alone is not proof.
 */
export interface KeyMaskEvidence {
  readonly prefix: string
  readonly suffix: string
}

/**
 * For provider-confirmed edge-preserving fields, retain literals around one
 * mask run. Neither the marker count nor either visible edge has a fixed size.
 * Multiple runs, unsupported characters and plaintext provide no evidence.
 * This parser does not certify upstream semantics: adapters must not call it
 * on display labels, fingerprints or fragments taken from internal positions.
 */
export function readEdgeKeyMask(
  value: string | null | undefined,
): KeyMaskEvidence | undefined {
  if (!value) return undefined
  const match =
    /^([A-Za-z0-9_-]*)(?:\*+|•+|●+|…+|\.{3,})([A-Za-z0-9_-]*)$/.exec(value)
  if (!match) return undefined
  const prefix = match[1]!
  const suffix = match[2]!
  if (!prefix && !suffix) return undefined
  return { prefix, suffix }
}

/**
 * Compare only overlapping characters at the same end. Mask length, hidden
 * length and cross-end alignment are deliberately not evidence of identity.
 * Compatible fragments never establish equality.
 */
export function areKeyMasksIncompatible(
  left: KeyMaskEvidence,
  right: KeyMaskEvidence,
  optionalSkPrefix = false,
): boolean {
  const prefix = (value: string) => {
    if (!optionalSkPrefix) return value
    if (value.startsWith("sk-")) return value.slice(3)
    // A partial optional auth prefix does not identify any credential bytes.
    return "sk-".startsWith(value) ? "" : value
  }
  const leftPrefix = prefix(left.prefix)
  const rightPrefix = prefix(right.prefix)
  const prefixLength = Math.min(leftPrefix.length, rightPrefix.length)
  const suffixLength = Math.min(left.suffix.length, right.suffix.length)
  return (
    leftPrefix.slice(0, prefixLength) !== rightPrefix.slice(0, prefixLength) ||
    (suffixLength > 0 &&
      left.suffix.slice(-suffixLength) !== right.suffix.slice(-suffixLength))
  )
}
