import { beforeEach, describe, expect, it, vi } from "vitest"

import { validateProtectionBypassTaskResource } from "~/entrypoints/background/protectionBypassResourceValidation"
import {
  PROTECTION_BYPASS_EXECUTION_KINDS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
  TEMP_CONTEXT_TASK_KINDS,
} from "~/services/protectionBypass/contracts"

const mocks = vi.hoisted(() => ({
  validateNewApi: vi.fn(),
  validateOctopus: vi.fn(),
}))

vi.mock(
  "~/services/managedSites/providers/newApiProtectionBypassResource",
  () => ({ validateNewApiSessionReadResource: mocks.validateNewApi }),
)
vi.mock(
  "~/services/managedSites/providers/octopusProtectionBypassResource",
  () => ({ validateOctopusApiFetchResource: mocks.validateOctopus }),
)

const execution = {
  version: 2,
  kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
  command: PROTECTION_BYPASS_USER_COMMANDS.ManageSiteChannels,
  feature: PROTECTION_BYPASS_FEATURES.ManagedSiteChannels,
  surface: PROTECTION_BYPASS_SURFACES.Options,
} as const

describe("validateProtectionBypassTaskResource", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.validateNewApi.mockResolvedValue(true)
    mocks.validateOctopus.mockResolvedValue(true)
  })

  it("dispatches resource-bound tasks to their provider adapter", async () => {
    const newApiTask = {
      kind: TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead,
      params: {
        origin: "https://new-api.example.invalid",
        action: "channel_key",
        channelId: 12,
        userId: "example-user",
      },
    } as const
    const octopusTask = {
      kind: TEMP_CONTEXT_TASK_KINDS.OctopusApiFetch,
      params: {
        originUrl: "https://octopus.example.invalid",
        resourceUsername: "example-admin",
        fetchUrl: "https://octopus.example.invalid/api/v1/channel/list",
      },
    } as const

    await expect(
      validateProtectionBypassTaskResource(newApiTask, execution),
    ).resolves.toBe(true)
    await expect(
      validateProtectionBypassTaskResource(octopusTask, execution),
    ).resolves.toBe(true)

    expect(mocks.validateNewApi).toHaveBeenCalledWith({
      origin: newApiTask.params.origin,
      userId: newApiTask.params.userId,
      channelId: newApiTask.params.channelId,
    })
    expect(mocks.validateOctopus).toHaveBeenCalledWith(octopusTask, execution)
  })

  it("treats tasks without a bound resource as current", async () => {
    await expect(
      validateProtectionBypassTaskResource(
        {
          kind: TEMP_CONTEXT_TASK_KINDS.OpenContext,
          params: {
            url: "https://example.invalid",
            requestId: "request-1",
          },
        },
        execution,
      ),
    ).resolves.toBe(true)

    expect(mocks.validateNewApi).not.toHaveBeenCalled()
    expect(mocks.validateOctopus).not.toHaveBeenCalled()
  })

  it("fails closed for an unknown task kind at the resource-validation seam", async () => {
    await expect(
      validateProtectionBypassTaskResource(
        { kind: "future_task", params: {} } as never,
        execution,
      ),
    ).resolves.toBe(false)

    expect(mocks.validateNewApi).not.toHaveBeenCalled()
    expect(mocks.validateOctopus).not.toHaveBeenCalled()
  })
})
