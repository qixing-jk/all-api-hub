import type { AccountFixture } from "~~/e2e/scenarios/accountFixtures"

export type AccountUsagePlanCheck<TContext> = {
  name: string
  run: (context: TContext) => Promise<void>
  timeoutMs?: number
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
  let runError: unknown

  try {
    await runAccountUsagePlan(context, checks, options)
  } catch (error) {
    runError = error
  }

  try {
    await context.account.cleanup()
  } catch (cleanupError) {
    if (runError) {
      throw new AggregateError(
        [runError, cleanupError],
        "Account usage plan failed and account cleanup also failed",
      )
    }

    throw cleanupError
  }

  if (runError) {
    throw runError
  }
}
