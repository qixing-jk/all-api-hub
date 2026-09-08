import { describe, expect, it } from "vitest"

import enAutoCheckin from "~/locales/en/autoCheckin.json"
import enSettings from "~/locales/en/settings.json"
import zhCnAutoCheckin from "~/locales/zh-CN/autoCheckin.json"
import zhCnSettings from "~/locales/zh-CN/settings.json"

describe("auto-checkin result category copy", () => {
  it("describes skipped check-in outcomes as not executed in Chinese", () => {
    expect(zhCnAutoCheckin.execution.filters.skipped).toBe("未执行")
    expect(zhCnAutoCheckin.execution.status.skipped).toBe("未执行")
    expect(zhCnAutoCheckin.status.result.skipped).toBe("未执行")
    expect(zhCnAutoCheckin.status.summary.skipped).toBe("未执行")
    expect(
      zhCnSettings.taskNotifications.notification
        .countsWithAutoCheckinCategories,
    ).toContain("未执行 {{skipped}}")
  })

  it("describes skipped check-in outcomes as not executed in English", () => {
    expect(enAutoCheckin.execution.filters.skipped).toBe("Not executed")
    expect(enAutoCheckin.execution.status.skipped).toBe("Not executed")
    expect(enAutoCheckin.status.result.skipped).toBe("Not executed")
    expect(enAutoCheckin.status.summary.skipped).toBe("Not executed")
    expect(
      enSettings.taskNotifications.notification.countsWithAutoCheckinCategories,
    ).toContain("not executed {{skipped}}")
  })
})
