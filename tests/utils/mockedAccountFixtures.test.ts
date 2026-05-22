import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import type { SiteAccount } from "~/types"
import {
  createStoredAccount,
  seedStoredAccounts,
} from "~~/e2e/utils/commonUserFlows"
import { seedMockAccountFixture } from "~~/e2e/utils/mockedSite/accountFixtures"

const mocks = vi.hoisted(() => ({
  createStoredAccount: vi.fn(),
  seedStoredAccounts: vi.fn(),
}))

vi.mock("~~/e2e/utils/commonUserFlows", () => ({
  createStoredAccount: mocks.createStoredAccount,
  seedStoredAccounts: mocks.seedStoredAccounts,
}))

function createAccount(overrides: Partial<SiteAccount> = {}): SiteAccount {
  return {
    id: "mock-account",
    site_type: SITE_TYPES.NEW_API,
    site_url: "https://mock.example.com",
    ...overrides,
  } as SiteAccount
}

describe("mocked account fixtures", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(seedStoredAccounts).mockResolvedValue(undefined)
  })

  it("creates and seeds a default account fixture", async () => {
    const serviceWorker = {} as any
    const account = createAccount()

    vi.mocked(createStoredAccount).mockReturnValue(account)

    const fixture = await seedMockAccountFixture({ serviceWorker })

    expect(createStoredAccount).toHaveBeenCalledWith({
      id: expect.stringMatching(/^e2e-account-/),
      site_type: SITE_TYPES.NEW_API,
      site_url: "https://example.com",
    })
    expect(seedStoredAccounts).toHaveBeenCalledWith(serviceWorker, [account])
    expect(fixture).toMatchObject({
      accountId: "mock-account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://mock.example.com",
    })
  })

  it("uses explicit account options when creating a fixture account", async () => {
    const serviceWorker = {} as any
    const account = createAccount({
      id: "custom-account",
      site_type: SITE_TYPES.VELOERA,
      site_url: "https://veloera.example.com",
    })

    vi.mocked(createStoredAccount).mockReturnValue(account)

    const fixture = await seedMockAccountFixture({
      serviceWorker,
      accountId: "custom-account",
      siteType: SITE_TYPES.VELOERA,
      baseUrl: "https://veloera.example.com",
    })

    expect(createStoredAccount).toHaveBeenCalledWith({
      id: "custom-account",
      site_type: SITE_TYPES.VELOERA,
      site_url: "https://veloera.example.com",
    })
    expect(fixture).toMatchObject({
      accountId: "custom-account",
      siteType: SITE_TYPES.VELOERA,
      baseUrl: "https://veloera.example.com",
    })
  })

  it("uses an explicit account without creating another stored account", async () => {
    const serviceWorker = {} as any
    const account = createAccount({
      id: "provided-account",
      site_url: "https://provided.example.com",
    })

    const fixture = await seedMockAccountFixture({ serviceWorker, account })

    expect(createStoredAccount).not.toHaveBeenCalled()
    expect(seedStoredAccounts).toHaveBeenCalledWith(serviceWorker, [account])
    expect(fixture).toMatchObject({
      accountId: "provided-account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://provided.example.com",
    })
  })

  it("clears seeded accounts once when the fixture is cleaned up", async () => {
    const serviceWorker = {} as any
    const account = createAccount()

    await seedMockAccountFixture({ serviceWorker, account }).then(
      async (fixture) => {
        await fixture.cleanup()
        await fixture.cleanup()
      },
    )

    expect(seedStoredAccounts).toHaveBeenCalledTimes(2)
    expect(seedStoredAccounts).toHaveBeenNthCalledWith(1, serviceWorker, [
      account,
    ])
    expect(seedStoredAccounts).toHaveBeenNthCalledWith(2, serviceWorker, [])
  })
})
