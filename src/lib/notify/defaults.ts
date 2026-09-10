/** Shared lifetimes for page and content notifications, in milliseconds. */
export const NOTIFICATION_DURATIONS = {
  success: 3000,
  error: 5000,
  info: 4000,
  warning: 5000,
  loading: Infinity,
} as const
