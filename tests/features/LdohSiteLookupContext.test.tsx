import { beforeEach, describe, expect, it, vi } from "vitest"

import { LdohSiteLookupProvider } from "~/features/LdohSiteLookup/hooks/LdohSiteLookupContext"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_EXECUTION_VERSION,
  PROTECTION_BYPASS_FEATURES,
} from "~/services/protectionBypass/contracts"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { render, waitFor } from "~~/tests/test-utils/render"

const {
  readFreshLdohSiteListCacheMock,
  readLdohSiteListCacheMock,
  requestLdohSiteLookupRefreshSitesMock,
  getCurrentTempWindowRequestSourceMock,
} = vi.hoisted(() => ({
  readFreshLdohSiteListCacheMock: vi.fn(),
  readLdohSiteListCacheMock: vi.fn(),
  requestLdohSiteLookupRefreshSitesMock: vi.fn(),
  getCurrentTempWindowRequestSourceMock: vi.fn(),
}))

vi.mock("~/services/integrations/ldohSiteLookup/cache", () => ({
  readFreshLdohSiteListCache: readFreshLdohSiteListCacheMock,
  readLdohSiteListCache: readLdohSiteListCacheMock,
}))

vi.mock("~/services/integrations/ldohSiteLookup/runtime", () => ({
  requestLdohSiteLookupRefreshSites: requestLdohSiteLookupRefreshSitesMock,
}))

vi.mock("~/utils/browser/tempWindowRequestSource", () => ({
  getCurrentTempWindowRequestSource: getCurrentTempWindowRequestSourceMock,
}))

describe("LdohSiteLookupProvider refresh intent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    readFreshLdohSiteListCacheMock.mockResolvedValue(null)
    readLdohSiteListCacheMock.mockResolvedValue(null)
    requestLdohSiteLookupRefreshSitesMock.mockResolvedValue({
      success: true,
      cachedCount: 0,
    })
  })

  it.each([
    TEMP_WINDOW_REQUEST_SOURCES.Options,
    TEMP_WINDOW_REQUEST_SOURCES.Popup,
  ])("uses the current %s surface for lifecycle refresh", async (surface) => {
    getCurrentTempWindowRequestSourceMock.mockReturnValue(surface)

    render(
      <LdohSiteLookupProvider>
        <div>child</div>
      </LdohSiteLookupProvider>,
    )

    await waitFor(() => {
      expect(requestLdohSiteLookupRefreshSitesMock).toHaveBeenCalledWith({
        maxAttempts: 1,
        protectionBypassExecution: {
          version: PROTECTION_BYPASS_EXECUTION_VERSION,
          kind: "automatic",
          feature: PROTECTION_BYPASS_FEATURES.LdohSiteLookup,
          trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
          surface,
        },
      })
    })
    expect(getCurrentTempWindowRequestSourceMock).toHaveBeenCalledTimes(1)
  })
})
