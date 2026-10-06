import {
  AUTO_CHECKIN_SCHEDULE_MODE,
  type AutoCheckinPreferences,
  type AutoCheckinStatus,
} from "~/types/autoCheckin"
import { formatLocalDayKey } from "~/utils/core/dayKey"

const DETERMINISTIC_CATCH_UP_DELAY_MS = 60_000

export interface AutoCheckinDailyTriggerPlan {
  triggerTime: Date
  enforceTodayTarget?: boolean
}

interface AutoCheckinDailyPlanningOptions {
  allowCatchUp?: boolean
}

/**
 * Splits an `HH:MM` window bound into numeric hour and minute parts.
 *
 * A missing or non-numeric part becomes `NaN`, which `Number.isNaN` rejects and
 * `Date.setHours` turns into an invalid date.
 */
function splitTimeParts(time: string): [number, number] {
  const [hour, minute] = time.split(":").map(Number)
  return [hour ?? Number.NaN, minute ?? Number.NaN]
}

/**
 * Add days using local calendar math (safe across DST changes).
 */
function addLocalDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/** Builds the local calendar day boundary. */
function startOfLocalDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  )
}

/** Validates a configured clock time before daily planning. */
export function parseTimeToMinutes(time: string): number | null {
  const [hourStr, minuteStr] = time.split(":")
  const hours = Number(hourStr)
  const minutes = Number(minuteStr)
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null
  }
  return hours * 60 + minutes
}

/** Tests a time against ordinary or cross-midnight windows. */
export function isMinutesWithinWindow(
  minutes: number,
  windowStart: number,
  windowEnd: number,
): boolean {
  if (windowStart === windowEnd) {
    return false
  }

  if (windowStart < windowEnd) {
    return minutes >= windowStart && minutes <= windowEnd
  }

  // Window crosses midnight
  return minutes >= windowStart || minutes <= windowEnd
}

/** Resolves the fixed daily trigger within its configured window. */
export function calculateDeterministicTriggerForDay(
  config: AutoCheckinPreferences,
  day: Date,
): Date | null {
  const deterministicMinutes = parseTimeToMinutes(
    config.deterministicTime || config.windowStart,
  )
  const windowStartMinutes = parseTimeToMinutes(config.windowStart)
  const windowEndMinutes = parseTimeToMinutes(config.windowEnd)

  if (
    deterministicMinutes === null ||
    windowStartMinutes === null ||
    windowEndMinutes === null
  ) {
    return null
  }

  if (
    !isMinutesWithinWindow(
      deterministicMinutes,
      windowStartMinutes,
      windowEndMinutes,
    )
  ) {
    return null
  }

  const target = new Date(day)
  target.setHours(
    Math.floor(deterministicMinutes / 60),
    deterministicMinutes % 60,
    0,
    0,
  )

  return target
}

/** Plans a bounded same-day startup catch-up. */
export function calculateDeterministicCatchUpTrigger(now: Date): Date | null {
  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)

  const desiredWhen = Math.min(
    now.getTime() + DETERMINISTIC_CATCH_UP_DELAY_MS,
    endOfToday.getTime(),
  )

  if (desiredWhen <= now.getTime()) {
    return null
  }

  return new Date(desiredWhen)
}

/** Samples a trigger within the configured local time window. */
export function calculateRandomTrigger(
  windowStart: string,
  windowEnd: string,
  now: Date,
): Date {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const [startHour, startMinute] = splitTimeParts(windowStart)
  const [endHour, endMinute] = splitTimeParts(windowEnd)

  const windowStartTime = new Date(today)
  windowStartTime.setHours(startHour, startMinute, 0, 0)

  const windowEndTime = new Date(today)
  windowEndTime.setHours(endHour, endMinute, 0, 0)

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const windowEndMinutes = endHour * 60 + endMinute
  if (windowEndTime <= windowStartTime) {
    windowEndTime.setDate(windowEndTime.getDate() + 1)
    if (
      now < windowStartTime &&
      (endHour !== startHour || endMinute !== startMinute) &&
      nowMinutes <= windowEndMinutes
    ) {
      windowStartTime.setDate(windowStartTime.getDate() - 1)
      windowEndTime.setDate(windowEndTime.getDate() - 1)
    }
  }

  if (now >= windowEndTime) {
    windowStartTime.setDate(windowStartTime.getDate() + 1)
    windowEndTime.setDate(windowEndTime.getDate() + 1)
  } else if (now < windowStartTime) {
    // use today's window as-is
  } else {
    windowStartTime.setTime(now.getTime())
  }

  const windowDuration = windowEndTime.getTime() - windowStartTime.getTime()
  const randomOffset = windowDuration <= 0 ? 0 : Math.random() * windowDuration
  return new Date(windowStartTime.getTime() + randomOffset)
}

/** Samples one trigger for the specified local calendar day. */
export function calculateRandomTriggerForDay(
  windowStart: string,
  windowEnd: string,
  day: Date,
): Date | null {
  const [startHour, startMinute] = splitTimeParts(windowStart)
  const [endHour, endMinute] = splitTimeParts(windowEnd)

  if (
    [startHour, startMinute, endHour, endMinute].some((value) =>
      Number.isNaN(value),
    )
  ) {
    return null
  }

  const windowStartTime = new Date(day)
  windowStartTime.setHours(startHour, startMinute, 0, 0)

  const windowEndTime = new Date(day)
  windowEndTime.setHours(endHour, endMinute, 0, 0)
  if (windowEndTime <= windowStartTime) {
    windowEndTime.setDate(windowEndTime.getDate() + 1)
  }

  const windowDuration = windowEndTime.getTime() - windowStartTime.getTime()
  const randomOffset = windowDuration <= 0 ? 0 : Math.random() * windowDuration
  return new Date(windowStartTime.getTime() + randomOffset)
}

/**
 * Compute the next trigger time for the *daily* (normal) auto check-in.
 *
 * Rules:
 * - If the daily run already executed today, schedule within tomorrow's window.
 * - Deterministic mode schedules the configured deterministic time (fallback: window start).
 * - Random mode picks one random time inside the target day's window.
 */
export function computeNextDailyTriggerPlan(
  config: AutoCheckinPreferences,
  status: AutoCheckinStatus | null,
  now: Date,
  planningOptions?: AutoCheckinDailyPlanningOptions,
): AutoCheckinDailyTriggerPlan | null {
  const today = formatLocalDayKey(now)
  const ranToday = status?.lastDailyRunDay === today
  const windowStartMinutes = parseTimeToMinutes(config.windowStart)
  const windowEndMinutes = parseTimeToMinutes(config.windowEnd)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const isWithinWindow =
    windowStartMinutes !== null &&
    windowEndMinutes !== null &&
    isMinutesWithinWindow(nowMinutes, windowStartMinutes, windowEndMinutes)
  const allowCatchUp = planningOptions?.allowCatchUp === true

  if (config.scheduleMode === AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC) {
    if (ranToday) {
      const tomorrowTrigger = calculateDeterministicTriggerForDay(
        config,
        addLocalDays(now, 1),
      )
      if (tomorrowTrigger) {
        return { triggerTime: tomorrowTrigger }
      }
    } else {
      const todayTrigger = calculateDeterministicTriggerForDay(config, now)
      if (todayTrigger) {
        if (todayTrigger > now) {
          return { triggerTime: todayTrigger }
        }

        if (allowCatchUp && isWithinWindow) {
          const catchUpTrigger = calculateDeterministicCatchUpTrigger(now)
          if (catchUpTrigger) {
            return {
              triggerTime: catchUpTrigger,
              enforceTodayTarget: true,
            }
          }
        }

        const tomorrowTrigger = calculateDeterministicTriggerForDay(
          config,
          addLocalDays(now, 1),
        )
        if (tomorrowTrigger) {
          return { triggerTime: tomorrowTrigger }
        }
      }
    }
  }

  if (ranToday) {
    const tomorrowStart = startOfLocalDay(addLocalDays(now, 1))
    const tomorrowTrigger = calculateRandomTriggerForDay(
      config.windowStart,
      config.windowEnd,
      tomorrowStart,
    )
    return tomorrowTrigger ? { triggerTime: tomorrowTrigger } : null
  }

  return {
    triggerTime: calculateRandomTrigger(
      config.windowStart,
      config.windowEnd,
      now,
    ),
  }
}

/**
 * Compute the next retry trigger time.
 *
 * We use `status.lastRunAt` as the base to avoid bunching retries too closely when multiple
 * status updates happen quickly, then add `retryStrategy.intervalMinutes`.
 *
 * Returns a short fallback delay when inputs are missing/invalid.
 */
export function computeNextRetryTriggerTime(
  config: AutoCheckinPreferences,
  status: AutoCheckinStatus | null,
  now: Date,
): Date {
  const intervalMinutes = Math.max(
    0,
    config.retryStrategy?.intervalMinutes ?? 0,
  )
  const intervalMs = intervalMinutes * 60 * 1000

  const lastRunMs =
    status?.lastRunAt != null
      ? new Date(status.lastRunAt).getTime()
      : now.getTime()
  const baseMs = Number.isFinite(lastRunMs) ? lastRunMs : now.getTime()
  const candidate = new Date(baseMs + intervalMs)

  if (Number.isNaN(candidate.getTime()) || candidate <= now) {
    return new Date(now.getTime() + 15 * 1000)
  }

  return candidate
}
