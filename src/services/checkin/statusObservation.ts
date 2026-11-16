import { formatLocalDayKey } from "~/utils/core/dayKey"

export type CheckInStatusObservation<T> = {
  observation: T
  observedAt: number
}

/** A response crossing a local day cannot answer which day's check-in it observed. */
export async function readDayStableCheckInObservation<T>(
  read: () => Promise<T | undefined>,
): Promise<CheckInStatusObservation<T> | undefined> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const startedDay = formatLocalDayKey()
    const observation = await read()
    const observedAt = Date.now()
    if (startedDay === formatLocalDayKey(new Date(observedAt)))
      return observation === undefined ? undefined : { observation, observedAt }
  }
  return undefined
}
