import { describe, expect, it, vi } from "vitest"

import type { AccountFixture } from "~~/e2e/scenarios/accountFixtures"
import {
  runAccountFixtureUsagePlan,
  runAccountUsagePlan,
  type AccountUsagePlanCheck,
} from "~~/e2e/scenarios/accountUsagePlan"

type TestUsageContext = {
  accountId: string
}

describe("account usage plan scenario", () => {
  it("runs named checks in order through explicit test steps", async () => {
    const events: string[] = []
    const context = { accountId: "account-1" }
    const checks: AccountUsagePlanCheck<TestUsageContext>[] = [
      {
        name: "first check",
        run: async (receivedContext) => {
          events.push(`run:${receivedContext.accountId}:first`)
        },
      },
      {
        name: "second check",
        run: async (receivedContext) => {
          events.push(`run:${receivedContext.accountId}:second`)
        },
      },
    ]

    await runAccountUsagePlan(context, checks, {
      step: async (name, run) => {
        events.push(`step:${name}`)
        await run()
      },
    })

    expect(events).toEqual([
      "step:first check",
      "run:account-1:first",
      "step:second check",
      "run:account-1:second",
    ])
  })

  it("stops at the failing check instead of hiding the failed workflow", async () => {
    const error = new Error("check failed")
    const skippedCheck = vi.fn()
    const checks: AccountUsagePlanCheck<TestUsageContext>[] = [
      {
        name: "failing check",
        run: async () => {
          throw error
        },
      },
      {
        name: "skipped check",
        run: skippedCheck,
      },
    ]

    await expect(
      runAccountUsagePlan({ accountId: "account-1" }, checks, {
        step: async (_name, run) => {
          await run()
        },
      }),
    ).rejects.toThrow(error)
    expect(skippedCheck).not.toHaveBeenCalled()
  })

  it("runs fixture-backed checks and cleans up the account fixture afterwards", async () => {
    const events: string[] = []
    const fixture: AccountFixture = {
      accountId: "account-1",
      siteType: "new-api",
      baseUrl: "https://example.com",
      cleanup: vi.fn(async () => {
        events.push("cleanup")
      }),
    }

    await runAccountFixtureUsagePlan(
      { account: fixture },
      [
        {
          name: "check account",
          run: async (context) => {
            events.push(`run:${context.account.accountId}`)
          },
        },
      ],
      {
        step: async (name, run) => {
          events.push(`step:${name}`)
          await run()
        },
      },
    )

    expect(events).toEqual(["step:check account", "run:account-1", "cleanup"])
    expect(fixture.cleanup).toHaveBeenCalledOnce()
  })

  it("cleans up the account fixture when a fixture-backed check fails", async () => {
    const error = new Error("check failed")
    const fixture: AccountFixture = {
      accountId: "account-1",
      siteType: "new-api",
      baseUrl: "https://example.com",
      cleanup: vi.fn().mockResolvedValue(undefined),
    }

    await expect(
      runAccountFixtureUsagePlan(
        { account: fixture },
        [
          {
            name: "failing check",
            run: async () => {
              throw error
            },
          },
        ],
        {
          step: async (_name, run) => {
            await run()
          },
        },
      ),
    ).rejects.toThrow(error)
    expect(fixture.cleanup).toHaveBeenCalledOnce()
  })

  it("preserves fixture-backed check and cleanup failures together", async () => {
    const checkError = new Error("check failed")
    const cleanupError = new Error("cleanup failed")
    const fixture: AccountFixture = {
      accountId: "account-1",
      siteType: "new-api",
      baseUrl: "https://example.com",
      cleanup: vi.fn().mockRejectedValue(cleanupError),
    }

    await expect(
      runAccountFixtureUsagePlan(
        { account: fixture },
        [
          {
            name: "failing check",
            run: async () => {
              throw checkError
            },
          },
        ],
        {
          step: async (_name, run) => {
            await run()
          },
        },
      ),
    ).rejects.toMatchObject({
      errors: [checkError, cleanupError],
    })
    expect(fixture.cleanup).toHaveBeenCalledOnce()
  })
})
