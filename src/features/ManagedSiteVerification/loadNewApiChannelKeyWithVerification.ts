import {
  fetchNewApiChannelKey,
  NewApiChannelKeyRequirementError,
} from "~/services/managedSites/providers/newApiSession"
import type { NewApiConfig } from "~/types/newApiConfig"

import type { OpenNewApiManagedVerificationParams } from "./useNewApiManagedVerification"

interface LoadNewApiChannelKeyWithVerificationParams {
  channelId: number
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
    const key = await fetchNewApiChannelKey({
      baseUrl: params.config.baseUrl,
      userId: params.config.userId,
      channelId: params.channelId,
      username: params.config.username,
      password: params.config.password,
      totpSecret: params.config.totpSecret,
    })

    await Promise.resolve(params.setKey(key))
    await Promise.resolve(params.onLoaded?.())
  }

  const openVerification = async (
    request?: OpenNewApiManagedVerificationParams["initialSessionResult"],
  ) => {
    await Promise.resolve(
      params.openVerification({
        kind: params.requestKind ?? "channel",
        label: params.label,
        config: params.config,
        initialSessionResult: request ?? undefined,
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

    throw error
  }
}
