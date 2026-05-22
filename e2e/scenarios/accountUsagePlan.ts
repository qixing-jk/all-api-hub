import type { AccountFixture } from "~~/e2e/scenarios/accountFixtures"

export type AccountUsagePlanCheck<TContext> = {
  name: string
  run: (context: TContext) => Promise<void>
}

type AccountUsagePlanStep = (
  name: string,
  run: () => Promise<void>,
) => Promise<void>

export async function runAccountUsagePlan<TContext>(
  context: TContext,
  checks: readonly AccountUsagePlanCheck<TContext>[],
  options: {
    step: AccountUsagePlanStep
  },
) {
  for (const check of checks) {
    await options.step(check.name, async () => {
      await check.run(context)
    })
  }
}

export async function runAccountFixtureUsagePlan<
  TContext extends { account: AccountFixture },
>(
  context: TContext,
  checks: readonly AccountUsagePlanCheck<TContext>[],
  options: {
    step: AccountUsagePlanStep
  },
) {
  try {
    await runAccountUsagePlan(context, checks, options)
  } finally {
    await context.account.cleanup()
  }
}
