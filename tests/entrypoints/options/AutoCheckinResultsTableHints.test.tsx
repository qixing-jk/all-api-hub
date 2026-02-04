import { describe, expect, it } from "vitest"

import ResultsTable from "~/entrypoints/options/pages/AutoCheckin/components/ResultsTable"
import { render, screen } from "~/tests/test-utils/render"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"

describe("AutoCheckin ResultsTable troubleshooting hints", () => {
  it("shows invalidAccessToken hint when the backend reports an invalid access token", async () => {
    render(
      <ResultsTable
        results={[
          {
            accountId: "account-1",
            accountName: "Account 1",
            status: CHECKIN_RESULT_STATUS.FAILED,
            rawMessage: "无权进行此操作，access token 无效",
            timestamp: 0,
          },
        ]}
      />,
    )

    expect(
      await screen.findByText("execution.hints.invalidAccessToken"),
    ).toBeInTheDocument()
  })

  it("does not show invalidAccessToken hint for unrelated failure messages", async () => {
    render(
      <ResultsTable
        results={[
          {
            accountId: "account-2",
            accountName: "Account 2",
            status: CHECKIN_RESULT_STATUS.FAILED,
            rawMessage: "签到失败",
            timestamp: 0,
          },
        ]}
      />,
    )

    await screen.findByText("签到失败")

    expect(
      screen.queryByText("execution.hints.invalidAccessToken"),
    ).not.toBeInTheDocument()
  })
})
