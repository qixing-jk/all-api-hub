import { SUB2API_MANAGED_RESOURCE_STATUS } from "~/constants/sub2api"
import {
  createManagedSiteChannelEffect,
  createManagedSiteMutationSequence,
  finishManagedSiteMutationStep,
  runManagedSiteMutationStep,
  type ManagedSiteMutationConfirmedEffect,
  type ManagedSiteMutationResult,
  type ManagedSiteMutationSequence,
} from "~/services/managedSites/mutations"
import {
  createSub2ApiApiKeyAccount,
  deleteSub2ApiApiKeyAccount,
  Sub2ApiAdminApiError,
  updateSub2ApiApiKeyAccount,
  type Sub2ApiApiKeyAccountCreateInput,
  type Sub2ApiApiKeyAccountUpdateInput,
} from "~/services/managedSites/providers/sub2api"
import type { Sub2ApiAdminApiKeyAccount } from "~/types/sub2apiManagedSite"
import type { Sub2ApiManagedSiteConfig } from "~/types/sub2apiManagedSiteConfig"

type MutationAttempt<T> =
  | { kind: "applied"; data: T }
  | { kind: "rejected"; error: Sub2ApiAdminApiError }

const runSub2ApiMutationStep = async <T>(input: {
  sequence: ManagedSiteMutationSequence<ManagedSiteMutationConfirmedEffect>
  effect: ManagedSiteMutationConfirmedEffect
  execute(observer: { onDispatch(): void; onResponse(): void }): Promise<T>
}) =>
  await runManagedSiteMutationStep({
    sequence: input.sequence,
    effect: input.effect,
    execute: async (observer): Promise<MutationAttempt<T>> => {
      try {
        return { kind: "applied", data: await input.execute(observer) }
      } catch (error) {
        if (
          error instanceof Sub2ApiAdminApiError &&
          error.evidence.responseReceived &&
          error.evidence.confirmedNonApplication
        ) {
          return { kind: "rejected", error }
        }
        throw error
      }
    },
    classifyResponse: (attempt) =>
      attempt.kind === "applied"
        ? { outcome: "applied", data: attempt.data }
        : {
            outcome: "rejected",
            diagnostic: {
              message: attempt.error.message,
              ...(attempt.error.code === undefined
                ? {}
                : { code: String(attempt.error.code) }),
              ...(attempt.error.status === undefined
                ? {}
                : { statusCode: attempt.error.status }),
              raw: attempt.error,
            },
          },
  })

type Sub2ApiMutationOptions = Parameters<typeof createSub2ApiApiKeyAccount>[2]

/** Shared provider-native create mutation used by native CRUD and imports. */
export async function createSub2ApiManagedAccountMutation(
  config: Sub2ApiManagedSiteConfig,
  input: Sub2ApiApiKeyAccountCreateInput,
  desiredStatus: "active" | "inactive",
  options?: Sub2ApiMutationOptions,
): Promise<ManagedSiteMutationResult<Sub2ApiAdminApiKeyAccount>> {
  const sequence = createManagedSiteMutationSequence({ idempotent: false })
  const createStep = await runSub2ApiMutationStep<Sub2ApiAdminApiKeyAccount>({
    sequence,
    effect: createManagedSiteChannelEffect("resource-created"),
    execute: async (observer) =>
      await createSub2ApiApiKeyAccount(config, input, {
        ...options,
        observer,
      }),
  })
  if (createStep.outcome !== "applied") {
    return finishManagedSiteMutationStep(sequence, createStep)
  }

  let account = createStep.data
  if (desiredStatus === "inactive") {
    const statusStep = await runSub2ApiMutationStep<Sub2ApiAdminApiKeyAccount>({
      sequence,
      effect: createManagedSiteChannelEffect("status-updated", account.id),
      execute: async (observer) =>
        await updateSub2ApiApiKeyAccount(
          config,
          account.id,
          { status: SUB2API_MANAGED_RESOURCE_STATUS.Inactive },
          { ...options, observer },
        ),
    })
    if (statusStep.outcome !== "applied") {
      return finishManagedSiteMutationStep(sequence, statusStep)
    }
    account = statusStep.data
  }

  return sequence.finish({ finalState: "confirmed", data: account })
}

/** Shared provider-native update mutation used by native CRUD and imports. */
export async function updateSub2ApiManagedAccountMutation(
  config: Sub2ApiManagedSiteConfig,
  accountId: number,
  input: Sub2ApiApiKeyAccountUpdateInput,
  options?: Sub2ApiMutationOptions,
): Promise<ManagedSiteMutationResult<Sub2ApiAdminApiKeyAccount>> {
  const sequence = createManagedSiteMutationSequence({ idempotent: false })
  const step = await runSub2ApiMutationStep<Sub2ApiAdminApiKeyAccount>({
    sequence,
    effect: createManagedSiteChannelEffect("resource-updated", accountId),
    execute: async (observer) =>
      await updateSub2ApiApiKeyAccount(config, accountId, input, {
        ...options,
        observer,
      }),
  })
  return finishManagedSiteMutationStep(sequence, step)
}

/** Shared provider-native delete mutation used by native CRUD and imports. */
export async function deleteSub2ApiManagedAccountMutation(
  config: Sub2ApiManagedSiteConfig,
  accountId: number,
  options?: Sub2ApiMutationOptions,
): Promise<ManagedSiteMutationResult<void>> {
  const sequence = createManagedSiteMutationSequence({ idempotent: false })
  const step = await runSub2ApiMutationStep<void>({
    sequence,
    effect: createManagedSiteChannelEffect("resource-deleted", accountId),
    execute: async (observer) => {
      await deleteSub2ApiApiKeyAccount(config, accountId, {
        ...options,
        observer,
      })
    },
  })
  return finishManagedSiteMutationStep(sequence, step)
}
