import type { TodayLogQueryConfig } from "~/services/history/usageHistory/usageLogModel"

// https://api2.laozhang.ai/log v31.1.5 uses p=0&pageSize and bare arrays.
// Generic Shell follows this known dialect; only an empty array proves completion.
export const SHELL_LOG_QUERY_CONFIG: TodayLogQueryConfig = {
  pageIndexOffset: -1,
  pageSizeParamName: "pageSize",
  paginateArraysUntilEmpty: true,
}
