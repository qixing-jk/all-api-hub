import assert from "node:assert/strict"

const dayMs = 86400000
const utc8Ms = 8 * 3600000
const preparationReserveMs = 120000

/** A previous scheduled run cannot satisfy this explicit click. */
export function currentResultStatus(result, clickedAt) {
  return result?.timestamp >= clickedAt ? result.status : undefined
}

/** Pin the intended reset before any authenticated onboarding operation. */
export function planReset(now) {
  const resetAt = (Math.floor((now + utc8Ms) / dayMs) + 1) * dayMs - utc8Ms
  assert(
    resetAt - now <= 30 * 60000,
    "Start within 30 minutes of UTC+8 midnight",
  )
  assertPreparationWindow(resetAt, now)
  return resetAt
}

/** Leave enough time for the current action and never roll forward a missed reset. */
export function assertPreparationWindow(resetAt, now) {
  assert(
    resetAt - now > preparationReserveMs,
    "Stop preparation: the intended UTC+8 reset is too close or has passed",
  )
}

/** Independent live oracle: a native structured USD 20 grant in this window. */
export function findAllowance(items, { userId, from, to }) {
  return items.find((item) => {
    if (
      item?.type !== 1 ||
      String(item.user_id) !== userId ||
      !Number.isSafeInteger(item.created_at) ||
      item.created_at < from ||
      item.created_at > to
    )
      return false
    let other = item.other
    if (typeof other === "string") {
      try {
        other = JSON.parse(other)
      } catch {
        return false
      }
    }
    return (
      Array.isArray(other?.content_parts) &&
      other.content_parts.some(
        (part) =>
          part?.key === "Daily allowance {{quota}}" &&
          typeof part.params?.quota === "string" &&
          /^[$＄]20(?:\.0+)?$/.test(part.params.quota),
      )
    )
  })
}

/** Native credit evidence is independent of the provider's stricter attribution. */
export function findNewAllowance(before, after, { userId, dayStart }) {
  if (
    findAllowance(before.items, {
      userId,
      from: dayStart,
      to: before.serverTime / 1000,
    })
  )
    return
  return findAllowance(after.items, {
    userId,
    from: Math.max(dayStart, before.serverTime / 1000),
    to: after.serverTime / 1000,
  })
}
