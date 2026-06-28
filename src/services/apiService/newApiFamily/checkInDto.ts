export interface NewApiCheckInRecord {
  /**
   * Check-in date in YYYY-MM-DD format.
   * @example "2026-01-03"
   */
  checkin_date: string
  quota_awarded: number
}

export interface NewApiCheckInStatus {
  /**
   * Whether check-in is enabled on the site.
   */
  enabled: boolean
  max_quota: number
  min_quota: number
  stats: {
    /**
     * Whether the account has already checked in today.
     * @example true Already checked in today.
     * @example false Not checked in today yet.
     */
    checked_in_today: boolean
    checkin_count: number
    records: NewApiCheckInRecord[]
    total_checkins: number
    total_quota: number
  }
}

export type NewApiCheckInResponse = {
  data: NewApiCheckInRecord
  success: boolean
  /**
   * Response message from the API.
   * @example "签到成功"
   * @example "今日已签到"
   * @example "签到失败，请稍后重试"
   * @example "签到失败：更新额度出错"
   */
  message: string
}
