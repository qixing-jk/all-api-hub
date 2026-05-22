import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  createAccountFixture,
  createNoopAccountFixtureCleanup,
  createOnceAccountFixtureCleanup,
  toAccountFixtureFromSavedAccount,
  withAccountFixtureCleanup,
} from "~~/e2e/scenarios/accountFixtures"

describe("account scenario fixtures", () => {
  it("creates a fixture from a saved account result with cleanup ownership", () => {
    const cleanup = vi.fn().mockResolvedValue(undefined)

    const fixture = toAccountFixtureFromSavedAccount(
      {
        accountId: "account-1",
        siteType: SITE_TYPES.NEW_API,
        baseUrl: "https://new-api.example.com",
      },
      { cleanup },
    )

    expect(fixture).toMatchObject({
      accountId: "account-1",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://new-api.example.com",
    })
    expect(fixture.cleanup).toBe(cleanup)
  })

  it("rejects saved account results without an account id", () => {
    expect(() =>
      toAccountFixtureFromSavedAccount(
        {
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://new-api.example.com",
        },
        { cleanup: createNoopAccountFixtureCleanup() },
      ),
    ).toThrow("AccountFixture requires accountId")
  })

  it("runs cleanup at most once when ownership is shared across composed scenarios", async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined)
    const onceCleanup = createOnceAccountFixtureCleanup(cleanup)

    await onceCleanup()
    await onceCleanup()

    expect(cleanup).toHaveBeenCalledOnce()
  })

  it("replays cleanup rejection when repeated callers share cleanup ownership", async () => {
    const cleanupError = new Error("cleanup failed")
    const cleanup = vi.fn().mockRejectedValue(cleanupError)
    const onceCleanup = createOnceAccountFixtureCleanup(cleanup)

    await expect(onceCleanup()).rejects.toBe(cleanupError)
    await expect(onceCleanup()).rejects.toBe(cleanupError)

    expect(cleanup).toHaveBeenCalledOnce()
  })

  it("shares pending cleanup with concurrent callers", async () => {
    let finishCleanup: () => void = () => undefined
    const cleanup = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve
        }),
    )
    const onceCleanup = createOnceAccountFixtureCleanup(cleanup)

    const firstCleanup = onceCleanup()
    const secondCleanup = onceCleanup()

    expect(cleanup).toHaveBeenCalledOnce()
    finishCleanup()

    await expect(firstCleanup).resolves.toBeUndefined()
    await expect(secondCleanup).resolves.toBeUndefined()
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it("creates explicit seeded fixtures for isolated existing-account scenarios", () => {
    const cleanup = createNoopAccountFixtureCleanup()

    const fixture = createAccountFixture({
      accountId: "seeded-account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://seeded.example.com",
      cleanup,
    })

    expect(fixture).toEqual({
      accountId: "seeded-account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://seeded.example.com",
      cleanup,
    })
  })

  it("runs a composed scenario block before cleaning up an account fixture", async () => {
    const events: string[] = []
    const fixture = createAccountFixture({
      accountId: "composed-account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://composed.example.com",
      cleanup: vi.fn(async () => {
        events.push("cleanup")
      }),
    })

    await expect(
      withAccountFixtureCleanup(fixture, async (account) => {
        events.push(`scenario:${account.accountId}`)
        expect(account).toBe(fixture)
      }),
    ).resolves.toBeUndefined()

    expect(events).toEqual(["scenario:composed-account", "cleanup"])
    expect(fixture.cleanup).toHaveBeenCalledOnce()
  })

  it("still cleans up the fixture when a composed scenario block fails", async () => {
    const scenarioError = new Error("scenario failed")
    const fixture = createAccountFixture({
      accountId: "composed-account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://composed.example.com",
      cleanup: vi.fn().mockResolvedValue(undefined),
    })

    await expect(
      withAccountFixtureCleanup(fixture, async () => {
        throw scenarioError
      }),
    ).rejects.toBe(scenarioError)

    expect(fixture.cleanup).toHaveBeenCalledOnce()
  })

  it("preserves composed scenario and cleanup failures together", async () => {
    const scenarioError = new Error("scenario failed")
    const cleanupError = new Error("cleanup failed")
    const fixture = createAccountFixture({
      accountId: "composed-account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://composed.example.com",
      cleanup: vi.fn().mockRejectedValue(cleanupError),
    })

    await expect(
      withAccountFixtureCleanup(fixture, async () => {
        throw scenarioError
      }),
    ).rejects.toMatchObject({
      errors: [scenarioError, cleanupError],
    })

    expect(fixture.cleanup).toHaveBeenCalledOnce()
  })
})
