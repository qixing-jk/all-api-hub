import {
  createUnixDayKeyFormatter,
  formatLocalDayKey,
} from "~/utils/core/dayKey"

export type CheckInStatusObservation<T> = {
  observation: T
  observedAt: number
}

/** Compare an observation with the current day in the method's reset timezone. */
export function isCheckInObservationCurrent(
  observedAt: number,
  timeZone?: string,
  now = Date.now(),
) {
  if (!Number.isFinite(observedAt)) return false
  if (!timeZone)
    return (
      formatLocalDayKey(new Date(observedAt)) ===
      formatLocalDayKey(new Date(now))
    )
  const dayKey = createUnixDayKeyFormatter(timeZone)
  return (
    dayKey(Math.floor(observedAt / 1000)) === dayKey(Math.floor(now / 1000))
  )
}

/** Retry a read that crosses the site's reset boundary. */
export async function readDayStableCheckInObservation<T>(
  read: () => Promise<T | undefined>,
  timeZone?: string,
): Promise<CheckInStatusObservation<T> | undefined> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const startedAt = Date.now()
    const observation = await read()
    const observedAt = Date.now()
    if (isCheckInObservationCurrent(startedAt, timeZone, observedAt))
      return observation === undefined ? undefined : { observation, observedAt }
  }
  return undefined
}
