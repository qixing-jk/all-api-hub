import { describe, expect, it, vi } from "vitest"

import {
  createAutomaticProtectionBypassExecution,
  createUserCommandProtectionBypassExecution,
  withProtectionBypassUserCommand,
} from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_EXECUTION_KINDS,
  PROTECTION_BYPASS_EXECUTION_VERSION,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"

describe("protection bypass execution constructors", () => {
  it("builds a versioned automatic execution without inferring its intent", () => {
    const execution = createAutomaticProtectionBypassExecution(
      PROTECTION_BYPASS_FEATURES.SiteDetection,
      PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
      PROTECTION_BYPASS_SURFACES.ContentScript,
    )

    expect(execution).toEqual({
      version: PROTECTION_BYPASS_EXECUTION_VERSION,
      kind: PROTECTION_BYPASS_EXECUTION_KINDS.Automatic,
      feature: PROTECTION_BYPASS_FEATURES.SiteDetection,
      trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
      surface: PROTECTION_BYPASS_SURFACES.ContentScript,
    })
    expect(Object.isFrozen(execution)).toBe(true)
  })

  it("builds an immutable plain user-command execution", () => {
    const execution = createUserCommandProtectionBypassExecution(
      PROTECTION_BYPASS_USER_COMMANDS.RefreshAccount,
      PROTECTION_BYPASS_SURFACES.Options,
    )

    expect(execution).toEqual({
      version: PROTECTION_BYPASS_EXECUTION_VERSION,
      kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
      command: PROTECTION_BYPASS_USER_COMMANDS.RefreshAccount,
      surface: PROTECTION_BYPASS_SURFACES.Options,
    })
    expect(Object.isFrozen(execution)).toBe(true)
  })
})

describe("withProtectionBypassUserCommand", () => {
  it("returns work result with plain intent and performs no runtime IO", async () => {
    const work = vi.fn().mockResolvedValue("refreshed")

    await expect(
      withProtectionBypassUserCommand(
        PROTECTION_BYPASS_USER_COMMANDS.RefreshAccount,
        PROTECTION_BYPASS_SURFACES.Options,
        work,
      ),
    ).resolves.toBe("refreshed")
    expect(work).toHaveBeenCalledWith({
      version: PROTECTION_BYPASS_EXECUTION_VERSION,
      kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
      command: PROTECTION_BYPASS_USER_COMMANDS.RefreshAccount,
      surface: PROTECTION_BYPASS_SURFACES.Options,
    })
  })

  it("rethrows the callback rejection unchanged", async () => {
    const rejection = new Error("refresh failed")

    await expect(
      withProtectionBypassUserCommand(
        PROTECTION_BYPASS_USER_COMMANDS.RefreshAccount,
        PROTECTION_BYPASS_SURFACES.Options,
        async () => {
          throw rejection
        },
      ),
    ).rejects.toBe(rejection)
  })

  it("shares one immutable execution across refresh-all fan-out", async () => {
    const workers = [vi.fn(), vi.fn(), vi.fn()]

    await withProtectionBypassUserCommand(
      PROTECTION_BYPASS_USER_COMMANDS.RefreshAllAccounts,
      PROTECTION_BYPASS_SURFACES.Options,
      async (execution) => {
        await Promise.all(workers.map(async (worker) => worker(execution)))
      },
    )

    const executions = workers.map((worker) => worker.mock.calls[0][0])
    expect(executions).toEqual([
      {
        version: PROTECTION_BYPASS_EXECUTION_VERSION,
        kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
        command: PROTECTION_BYPASS_USER_COMMANDS.RefreshAllAccounts,
        surface: PROTECTION_BYPASS_SURFACES.Options,
      },
      executions[0],
      executions[0],
    ])
    expect(executions.every((execution) => execution === executions[0])).toBe(
      true,
    )
    expect(Object.isFrozen(executions[0])).toBe(true)
  })
})
