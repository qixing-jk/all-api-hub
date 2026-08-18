import { beforeEach, describe, expect, it, vi } from "vitest"

import { tempWindowOctopusApiFetch } from "~/services/apiService/octopus/tempContextClient"
import {
  PROTECTION_BYPASS_USER_COMMANDS,
  TEMP_CONTEXT_TASK_KINDS,
} from "~/services/protectionBypass/contracts"
import { executeProtectionBypassTask } from "~/utils/browser/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"

vi.mock("~/utils/browser/tempWindowFetch", () => ({
  executeProtectionBypassTask: vi.fn(),
}))

describe("Octopus temporary-context client", () => {
  beforeEach(() => vi.clearAllMocks())

  it("sends a closed provider task without duplicating execution metadata", async () => {
    const execution = userCommandExecution(
      PROTECTION_BYPASS_USER_COMMANDS.ManageSiteChannels,
    )
    vi.mocked(executeProtectionBypassTask).mockResolvedValueOnce({
      success: true,
      status: 200,
      data: { code: 200, data: [] },
    })

    await tempWindowOctopusApiFetch({
      originUrl: "https://example.invalid",
      fetchUrl: "https://example.invalid/api/v1/channel/list",
      fetchOptions: {
        method: "GET",
        headers: new Headers({ "Content-Type": "application/json" }),
        signal: new AbortController().signal,
      },
      requestId: "request-octopus-list",
      protectionBypassExecution: execution,
    })

    expect(executeProtectionBypassTask).toHaveBeenCalledWith({
      execution,
      task: {
        kind: TEMP_CONTEXT_TASK_KINDS.OctopusApiFetch,
        params: {
          originUrl: "https://example.invalid",
          fetchUrl: "https://example.invalid/api/v1/channel/list",
          fetchOptions: {
            method: "GET",
            headers: { "content-type": "application/json" },
          },
          requestId: "request-octopus-list",
          responseType: "json",
        },
      },
    })
  })
})
