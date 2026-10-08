import { type AutoCheckinPreferences } from "~/types/autoCheckin"

export interface AutoCheckinRetryScheduling {
  clearRetryAlarm(maxAttempts?: number): Promise<void>
  clearRetryAlarmAndState(): Promise<void>
  scheduleRetryAlarm(config: AutoCheckinPreferences): Promise<void>
}
