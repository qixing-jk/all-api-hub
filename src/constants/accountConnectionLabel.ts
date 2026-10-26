/**
 * Label shared by every bootstrap flow that mints an account credential inside
 * a provider console.
 *
 * The format stays identical across sites so a key created by All API Hub is
 * recognizable in the provider's key list even after the extension forgets the
 * request that produced it.
 */
export const createAccountConnectionShortCode = (requestId: string) => {
  const uuidPrefix = requestId.match(
    /\b([0-9a-f]{8})-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  )?.[1]
  if (uuidPrefix) return uuidPrefix.toLowerCase()

  let hash = 2166136261
  for (const character of requestId) {
    hash ^= character.codePointAt(0)!
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

/** One label per provisioning attempt; the short code keeps attempts distinct. */
export const createAccountConnectionLabel = (requestId: string) =>
  `All API Hub - Account Connection (${createAccountConnectionShortCode(requestId)})`
