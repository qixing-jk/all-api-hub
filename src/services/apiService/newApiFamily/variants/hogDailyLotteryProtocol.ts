import { getDayKeyFromUnixSeconds } from "~/utils/core/dayKey"

export const HOG_LOTTERY_ENDPOINTS = {
  Status: "/api/lottery/status",
  Config: "/api/lottery/config",
  Draw: "/api/lottery/draw",
} as const

/** Hog's model.LotteryBusinessDay uses Asia/Shanghai, independent of the client. */
export const getHogLotteryPeriodKey = (timestamp: number) =>
  getDayKeyFromUnixSeconds(Math.floor(timestamp / 1000), "Asia/Shanghai")
