import {
  fetchNewApiChannelKey,
  NewApiChannelKeyRequirementError,
} from "~/services/managedSites/providers/newApiSession"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_SURFACES,
  type PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import type { NewApiConfig } from "~/types/newApiConfig"

import {
  getNewApiManagedVerificationErrorMessage,
  isNewApiManagedVerificationWindowError,
} from "./errorMessages"
import type { OpenNewApiManagedVerificationParams } from "./useNewApiManagedVerification"

interface LoadNewApiChannelKeyWithVerificationParams {
  channelId: number
  command:
    | typeof PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys
    | typeof PROTECTION_BYPASS_USER_COMMANDS.ManageSiteChannels
  label?: string
  requestKind?: OpenNewApiManagedVerificationParams["kind"]
  config: Pick<
    NewApiConfig,
    "baseUrl" | "userId" | "username" | "password" | "totpSecret"
  >
  setKey: (key: string) => void | Promise<void>
  onLoaded?: () => void | Promise<void>
  openVerification: (
    request: OpenNewApiManagedVerificationParams,
  ) => void | Promise<void>
}

/**
 * Attempts to load a hidden New API channel key immediately and only opens the
 * interactive verification dialog when the backend still requires it.
 */
export async function loadNewApiChannelKeyWithVerification(
  params: LoadNewApiChannelKeyWithVerificationParams,
): Promise<boolean> {
  const loadKey = async () => {
    const key = await withProtectionBypassUserCommand(
      params.command,
      PROTECTION_BYPASS_SURFACES.Options,
      async (protectionBypassExecution) =>
        await fetchNewApiChannelKey({
          baseUrl: params.config.baseUrl,
          userId: params.config.userId,
          channelId: params.channelId,
          username: params.config.username,
          password: params.config.password,
          totpSecret: params.config.totpSecret,
          protectionBypassExecution,
        }),
    )

    await Promise.resolve(params.setKey(key))
    await Promise.resolve(params.onLoaded?.())
  }

  const openVerification = async (
    request?: OpenNewApiManagedVerificationParams["initialSessionResult"],
    initialFailureMessage?: string,
  ) => {
    await Promise.resolve(
      params.openVerification({
        kind: params.requestKind ?? "channel",
        label: params.label,
        config: params.config,
        initialSessionResult: request ?? undefined,
        initialFailureMessage,
        onVerified: async () => {
          await loadKey()
        },
      }),
    )
  }

  try {
    await loadKey()
    return true
  } catch (error) {
    if (error instanceof NewApiChannelKeyRequirementError) {
      await openVerification(error.sessionResult)
      return false
    }

    if (isNewApiManagedVerificationWindowError(error)) {
      await openVerification(
        undefined,
        getNewApiManagedVerificationErrorMessage(error),
      )
      return false
    }

    throw error
  }
}
