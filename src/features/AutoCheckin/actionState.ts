export const AUTO_CHECKIN_DEBUG_ACTIONS = {
  TRIGGER_DAILY_ALARM: "trigger_daily_alarm",
  TRIGGER_RETRY_ALARM: "trigger_retry_alarm",
  SCHEDULE_DAILY_ALARM: "schedule_daily_alarm",
  EVALUATE_UI_OPEN_PRETRIGGER: "evaluate_ui_open_pretrigger",
  TRIGGER_UI_OPEN_PRETRIGGER: "trigger_ui_open_pretrigger",
  RESET_LAST_DAILY_RUN_DAY: "reset_last_daily_run_day",
} as const

export type AutoCheckinDebugAction =
  (typeof AUTO_CHECKIN_DEBUG_ACTIONS)[keyof typeof AUTO_CHECKIN_DEBUG_ACTIONS]
