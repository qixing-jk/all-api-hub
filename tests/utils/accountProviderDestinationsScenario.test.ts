import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { runAccountProviderDestinationsScenario } from "~~/e2e/scenarios/accountProviderDestinations"

type PollCallback = () => Promise<boolean>

const mocks = vi.hoisted(() => {
  type MockedPlaywrightExpect = ReturnType<typeof vi.fn> & {
    poll: ReturnType<typeof vi.fn>
  }

  const playwrightExpect = vi.fn() as MockedPlaywrightExpect
  Object.assign(playwrightExpect, {
    poll: vi.fn(() => ({
      toBe: vi.fn().mockResolvedValue(undefined),
    })),
  })

  return {
    expect: playwrightExpect,
  }
})

vi.mock("~~/e2e/fixtures/extensionTest", () => ({
  expect: mocks.expect,
}))

describe("account provider destinations E2E scenario", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("opens provider usage and redeem routes from a saved account row", async () => {
    const rowMoreActionsButton = {
      click: vi.fn().mockResolvedValue(undefined),
    }
    const row = {
      hover: vi.fn().mockResolvedValue(undefined),
      getByTestId: vi.fn(() => rowMoreActionsButton),
    }
    const usageMenuItem = {
      click: vi.fn().mockResolvedValue(undefined),
    }
    const redeemMenuItem = {
      click: vi.fn().mockResolvedValue(undefined),
    }
    const page = {
      bringToFront: vi.fn().mockResolvedValue(undefined),
      getByTestId: vi.fn((testId: string) => {
        if (testId === getAccountManagementListItemTestId("account-1")) {
          return row
        }

        if (testId === ACCOUNT_MANAGEMENT_TEST_IDS.rowUsageLogMenuItem) {
          return usageMenuItem
        }

        if (testId === ACCOUNT_MANAGEMENT_TEST_IDS.rowRedeemMenuItem) {
          return redeemMenuItem
        }

        throw new Error(`Unexpected test id: ${testId}`)
      }),
    }
    const serviceWorker = {
      evaluate: vi.fn().mockResolvedValue(true),
    }

    await runAccountProviderDestinationsScenario({
      page: page as any,
      serviceWorker: serviceWorker as any,
      account: {
        accountId: "account-1",
        siteType: SITE_TYPES.VELOERA,
        baseUrl: "https://veloera.test",
      },
    })

    expect(row.hover).toHaveBeenCalledTimes(2)
    expect(row.getByTestId).toHaveBeenCalledWith(
      ACCOUNT_MANAGEMENT_TEST_IDS.rowMoreActionsButton,
    )
    expect(usageMenuItem.click).toHaveBeenCalledOnce()
    expect(redeemMenuItem.click).toHaveBeenCalledOnce()
    expect(page.bringToFront).toHaveBeenCalledTimes(3)

    const pollCallbacks = vi
      .mocked(mocks.expect.poll)
      .mock.calls.map(([callback]) => callback as PollCallback)
    expect(pollCallbacks).toHaveLength(2)

    await pollCallbacks[0]()
    await pollCallbacks[1]()

    expect(serviceWorker.evaluate).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      "https://veloera.test/app/logs/api-usage",
    )
    expect(serviceWorker.evaluate).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      "https://veloera.test/app/wallet",
    )
  })

  it("validates real provider destination pages when requested", async () => {
    const validationPage = createValidationPage()
    const page = createProviderDestinationsPage({
      newPage: vi.fn().mockResolvedValue(validationPage),
    })
    const serviceWorker = {
      evaluate: vi.fn().mockResolvedValue(true),
    }

    await runAccountProviderDestinationsScenario({
      page: page as any,
      serviceWorker: serviceWorker as any,
      account: {
        accountId: "account-1",
        siteType: SITE_TYPES.VELOERA,
        baseUrl: "https://veloera.test",
      },
      validateDestinationPages: true,
    })

    expect(page.context().newPage).toHaveBeenCalledTimes(2)
    expect(validationPage.goto).toHaveBeenNthCalledWith(
      1,
      "https://veloera.test/app/logs/api-usage",
      expect.objectContaining({
        waitUntil: "domcontentloaded",
      }),
    )
    expect(validationPage.goto).toHaveBeenNthCalledWith(
      2,
      "https://veloera.test/app/wallet",
      expect.objectContaining({
        waitUntil: "domcontentloaded",
      }),
    )
    expect(validationPage.close).toHaveBeenCalledTimes(2)
  })

  it("can validate only direct-navigation-stable provider destination pages", async () => {
    const validationPage = createValidationPage()
    const page = createProviderDestinationsPage({
      newPage: vi.fn().mockResolvedValue(validationPage),
    })
    const serviceWorker = {
      evaluate: vi.fn().mockResolvedValue(true),
    }

    await runAccountProviderDestinationsScenario({
      page: page as any,
      serviceWorker: serviceWorker as any,
      account: {
        accountId: "account-1",
        siteType: SITE_TYPES.VELOERA,
        baseUrl: "https://veloera.test",
      },
      validateDestinationPages: {
        usage: true,
        redeem: false,
      },
    })

    expect(page.context().newPage).toHaveBeenCalledOnce()
    expect(validationPage.goto).toHaveBeenCalledOnce()
    expect(validationPage.goto).toHaveBeenCalledWith(
      "https://veloera.test/app/logs/api-usage",
      expect.objectContaining({
        waitUntil: "domcontentloaded",
      }),
    )
  })

  it("fails validation when a real provider destination returns an error status", async () => {
    const validationPage = createValidationPage({ status: 404 })
    const page = createProviderDestinationsPage({
      newPage: vi.fn().mockResolvedValue(validationPage),
    })
    const serviceWorker = {
      evaluate: vi.fn().mockResolvedValue(true),
    }

    await expect(
      runAccountProviderDestinationsScenario({
        page: page as any,
        serviceWorker: serviceWorker as any,
        account: {
          accountId: "account-1",
          siteType: SITE_TYPES.VELOERA,
          baseUrl: "https://veloera.test",
        },
        validateDestinationPages: true,
      }),
    ).rejects.toThrow(
      "Provider destination returned HTTP 404: https://veloera.test/app/logs/api-usage",
    )

    expect(validationPage.close).toHaveBeenCalledOnce()
  })
})

function createProviderDestinationsPage(options: {
  newPage: ReturnType<typeof vi.fn>
}) {
  const rowMoreActionsButton = {
    click: vi.fn().mockResolvedValue(undefined),
  }
  const row = {
    hover: vi.fn().mockResolvedValue(undefined),
    getByTestId: vi.fn(() => rowMoreActionsButton),
  }
  const usageMenuItem = {
    click: vi.fn().mockResolvedValue(undefined),
  }
  const redeemMenuItem = {
    click: vi.fn().mockResolvedValue(undefined),
  }
  const context = {
    newPage: options.newPage,
  }

  return {
    bringToFront: vi.fn().mockResolvedValue(undefined),
    context: vi.fn(() => context),
    getByTestId: vi.fn((testId: string) => {
      if (testId === getAccountManagementListItemTestId("account-1")) {
        return row
      }

      if (testId === ACCOUNT_MANAGEMENT_TEST_IDS.rowUsageLogMenuItem) {
        return usageMenuItem
      }

      if (testId === ACCOUNT_MANAGEMENT_TEST_IDS.rowRedeemMenuItem) {
        return redeemMenuItem
      }

      throw new Error(`Unexpected test id: ${testId}`)
    }),
  }
}

function createValidationPage(
  options: { status?: number; bodyText?: string } = {},
) {
  return {
    goto: vi.fn().mockResolvedValue({
      status: vi.fn(() => options.status ?? 200),
    }),
    title: vi.fn().mockResolvedValue("Usage"),
    locator: vi.fn(() => ({
      innerText: vi.fn().mockResolvedValue(options.bodyText ?? "Usage content"),
    })),
    close: vi.fn().mockResolvedValue(undefined),
  }
}
