import { expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { executeTempWindowFetch } from "~/services/browsingContext/tempPage/fetchTasks"
import { tempWindowBackgroundRuntime } from "~/services/browsingContext/tempPage/runtime"
import { AuthTypeEnum } from "~/types"

it("opens a temporary bearer request in its pinned browser cookie store", async () => {
  const acquire = vi
    .spyOn(tempWindowBackgroundRuntime, "acquire")
    .mockRejectedValue(new Error("Fixture stopped before opening a page"))
  const origin = "https://sub2api.example"
  try {
    await executeTempWindowFetch(
      {
        siteType: SITE_TYPES.SUB2API,
        originUrl: origin,
        fetchUrl: `${origin}/api/v1/auth/me`,
        requestId: "browser-context-request",
        authType: AuthTypeEnum.AccessToken,
        cookieStoreId: "firefox-container-2",
      },
      true,
      vi.fn(),
    )
    expect(acquire).toHaveBeenCalledExactlyOnceWith(
      origin,
      "browser-context-request",
      true,
      { incognito: false, cookieStoreId: "firefox-container-2" },
      undefined,
    )
  } finally {
    acquire.mockRestore()
  }
})
