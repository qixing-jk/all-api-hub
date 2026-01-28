import { describe, expect, it } from "vitest"

import StatusCard from "~/entrypoints/options/pages/AutoCheckin/components/StatusCard"
import { render, screen, within } from "~/tests/test-utils/render"
import type {
  AutoCheckinPreferences,
  AutoCheckinStatus,
} from "~/types/autoCheckin"

describe("AutoCheckin StatusCard scheduling labels", () => {
  const basePreferences: AutoCheckinPreferences = {
    globalEnabled: true,
    pretriggerDailyOnUiOpen: true,
    notifyUiOnCompletion: true,
    windowStart: "09:00",
    windowEnd: "18:00",
    scheduleMode: "random",
    deterministicTime: "09:00",
    retryStrategy: {
      enabled: false,
      intervalMinutes: 30,
      maxAttemptsPerDay: 3,
    },
  }

  it("shows disabled for daily schedule when globalEnabled is false", async () => {
    const status: AutoCheckinStatus = {}
    render(
      <StatusCard
        status={status}
        preferences={{ ...basePreferences, globalEnabled: false }}
      />,
    )

    expect(await screen.findByText("status.disabled")).toBeInTheDocument()
  })

  it("shows retryDisabled for retry schedule when retry is disabled", async () => {
    const status: AutoCheckinStatus = {}
    render(<StatusCard status={status} preferences={basePreferences} />)

    expect(await screen.findByText("status.retryDisabled")).toBeInTheDocument()
  })

  it("shows noPendingRetry when retry is enabled but there is no retry queue", async () => {
    const status: AutoCheckinStatus = {}
    render(
      <StatusCard
        status={status}
        preferences={{
          ...basePreferences,
          retryStrategy: { ...basePreferences.retryStrategy, enabled: true },
        }}
      />,
    )

    expect(await screen.findByText("status.noPendingRetry")).toBeInTheDocument()
  })

  it("falls back to notScheduled when retry is enabled and pending but no schedule exists", async () => {
    const status: AutoCheckinStatus = {
      retryState: {
        day: "2024-01-01",
        pendingAccountIds: ["a"],
        attemptsByAccount: { a: 1 },
      },
    }
    render(
      <StatusCard
        status={status}
        preferences={{
          ...basePreferences,
          retryStrategy: { ...basePreferences.retryStrategy, enabled: true },
        }}
      />,
    )

    const retryLabel = await screen.findByText("status.nextRetry")
    const retrySection = retryLabel.parentElement as HTMLElement
    expect(
      within(retrySection).getByText("status.notScheduled"),
    ).toBeInTheDocument()
    expect(
      within(retrySection).getByText("status.pendingRetry"),
    ).toBeInTheDocument()
  })
})
