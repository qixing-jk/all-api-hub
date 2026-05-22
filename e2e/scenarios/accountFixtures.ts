import type { AccountSiteType } from "~/constants/siteType"
import type { SavedAccountUiResult } from "~~/e2e/utils/accountLifecycle"

export type AccountFixture = {
  accountId: string
  siteType: AccountSiteType
  baseUrl: string
  cleanup: () => Promise<void>
}

export function createNoopAccountFixtureCleanup() {
  return async () => undefined
}

export function createOnceAccountFixtureCleanup(
  cleanup: () => Promise<void>,
): () => Promise<void> {
  let cleanupPromise: Promise<void> | undefined

  return async () => {
    if (!cleanupPromise) {
      cleanupPromise = cleanup()
    }

    return cleanupPromise
  }
}

export function createAccountFixture(params: AccountFixture): AccountFixture {
  if (!params.accountId) {
    throw new Error("AccountFixture requires accountId")
  }

  return params
}

export function toAccountFixtureFromSavedAccount(
  savedAccount: SavedAccountUiResult,
  options: {
    cleanup: () => Promise<void>
  },
): AccountFixture {
  if (!savedAccount.accountId) {
    throw new Error("AccountFixture requires accountId")
  }

  return createAccountFixture({
    accountId: savedAccount.accountId,
    siteType: savedAccount.siteType,
    baseUrl: savedAccount.baseUrl,
    cleanup: options.cleanup,
  })
}

export async function withAccountFixtureCleanup(
  fixture: AccountFixture,
  runScenario: (fixture: AccountFixture) => Promise<void>,
) {
  let scenarioError: unknown

  try {
    await runScenario(fixture)
  } catch (error) {
    scenarioError = error
  }

  try {
    await fixture.cleanup()
  } catch (cleanupError) {
    if (scenarioError) {
      throw new AggregateError(
        [scenarioError, cleanupError],
        "Account fixture scenario failed and cleanup also failed",
      )
    }

    throw cleanupError
  }

  if (scenarioError) {
    throw scenarioError
  }
}
