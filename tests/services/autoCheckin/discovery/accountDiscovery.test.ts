import { afterEach, expect, it, vi } from "vitest"

import { discoverAccountCheckInMethods } from "~/services/checkin/autoCheckin/discovery/accountDiscovery"
import { discoverCheckInMethods } from "~/services/checkin/autoCheckin/discovery/discovery"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

const { resolveFixtureRegistry } = vi.hoisted(() => ({
  resolveFixtureRegistry: vi.fn(),
}))
afterEach(() => vi.unstubAllEnvs())
vi.mock("~/services/checkin/autoCheckin/discovery/discovery", () => ({
  discoverCheckInMethods: vi.fn(async () => ({
    config: {},
    decision: { outcome: "unsupported" },
  })),
}))
vi.mock(
  "~/services/checkin/autoCheckin/discovery/devDiscoveryFixtures",
  () => ({
    resolveDevCheckInDiscoveryRegistry: resolveFixtureRegistry,
  }),
)

it("does not load or await fixture discovery for ordinary accounts in development", async () => {
  vi.stubEnv("DEV", true)
  resolveFixtureRegistry.mockImplementation(() => new Promise(() => {}))
  const account = buildSiteAccount({ site_url: "https://real.example.com" })
  let completed = false
  void discoverAccountCheckInMethods(account, {}).then(() => {
    completed = true
  })
  await vi.dynamicImportSettled()
  expect(resolveFixtureRegistry).not.toHaveBeenCalled()
  expect(completed).toBe(true)
  expect(discoverCheckInMethods).toHaveBeenCalledWith(
    expect.objectContaining({ account }),
  )
})
