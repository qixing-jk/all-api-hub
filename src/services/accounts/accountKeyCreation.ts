import {
  buildAccountKeyResourceRuntimeKeyFromFacts,
  buildAccountKeyResourceRuntimeKeyId,
  isAccountRuntimeKeyCompatibleWithModel,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import type { CreatedRuntimeSecret } from "~/services/accounts/createdRuntimeSecret"
import {
  createDisplayAccountApiContext,
  fetchDisplayAccountRuntimeKeys,
} from "~/services/accounts/utils/apiServiceRequest"
import {
  AccountKeyResourceError,
  type AccountKeyCreationIntent,
  type AccountKeyProvisioningRequirement,
  type AccountKeyResourceFacts,
  type AccountKeyResourceRef,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  getInventorySecretAvailability,
  INVENTORY_SECRET_AVAILABILITIES,
} from "~/services/apiAdapters/contracts/inventorySecret"
import { awaitAbortableAccountKeyResourceOperation } from "~/services/apiAdapters/nativeResources/accountKeyResourceInventory"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { DisplaySiteData } from "~/types"

/** Confirmed creation can retain a reference even when the subsequent detail read fails. */
export type AccountKeyCreationResult = {
  readonly ref: AccountKeyResourceRef | null
  readonly facts: AccountKeyResourceFacts | null
  readonly createdSecret?: CreatedRuntimeSecret
}

export type AccountKeyCreationPlan =
  | { readonly kind: "ready"; create(): Promise<AccountKeyCreationResult> }
  | {
      readonly kind: "selection-required"
      readonly requirements: readonly AccountKeyProvisioningRequirement[]
      create(requirementKey: string): Promise<AccountKeyCreationResult>
    }
  | { readonly kind: "input-required" }

type Options = ResourceOperationOptions & {
  protectionBypassExecution?: ProtectionBypassExecution
  intent?: AccountKeyCreationIntent
}

/** Open a native creation session without translating product intent into a write DTO. */
export async function prepareDefaultAccountKeyCreation(
  account: DisplaySiteData,
  options: Options = {},
): Promise<AccountKeyCreationPlan> {
  const { accountKeyResources, request } =
    createDisplayAccountApiContext(account)
  if (!accountKeyResources) {
    throw new AccountKeyResourceError({ code: "unavailable" })
  }
  const policy = accountKeyResources.defaultCreation ?? "requires-input"
  if (policy === "requires-input") return { kind: "input-required" }
  options.signal?.throwIfAborted()
  const session = await accountKeyResources.open(
    {
      account,
      request: {
        ...request,
        protectionBypassExecution: options.protectionBypassExecution,
      },
    },
    options,
  )
  if (policy === "editor-defaults" || options.intent) {
    const scope = await session.resolveDefaultScope(options)
    const editor = await session.openCreateEditor(
      scope.scopeKey,
      options,
      options.intent,
    )
    if (!editor.validate(editor.initialValues).valid)
      return { kind: "input-required" }
    let result: Promise<AccountKeyCreationResult> | undefined
    return {
      kind: "ready",
      create: () =>
        (result ??= Promise.resolve().then(async () => {
          options.signal?.throwIfAborted()
          const created = await editor.submit(editor.initialValues, options)
          return { ...created, ref: created.facts?.ref ?? null }
        })),
    }
  }

  const provisioning = session.provisioning
  if (!provisioning) return { kind: "input-required" }
  const snapshot = await provisioning.inspect(options)
  if (snapshot.partialFailure)
    throw new AccountKeyResourceError(snapshot.partialFailure)
  const requirements = snapshot.requirements.filter((requirement) => {
    const { preferredGroup, allowedGroups } = options.intent ?? {}
    return (
      (!preferredGroup || requirement.displayName === preferredGroup) &&
      (!allowedGroups || allowedGroups.includes(requirement.displayName))
    )
  })
  if (!requirements.length) return { kind: "input-required" }
  let result: Promise<AccountKeyCreationResult> | undefined
  const create = (requirementKey: string) => {
    if (result) return result
    const requirement = requirements.find(
      (candidate) => candidate.requirementKey === requirementKey,
    )
    if (!requirement || requirement.provisioning.kind !== "automatic") {
      throw new AccountKeyResourceError({ code: "validation_failed" })
    }
    result = (async () => {
      options.signal?.throwIfAborted()
      const mutation = await provisioning.provision(requirementKey, options)
      if (mutation.certainty !== "applied") {
        // Only a proved non-write may be retried. Keep uncertain outcomes cached.
        if (mutation.certainty === "not-applied") result = undefined
        throw new AccountKeyResourceError({
          ...mutation.failure,
          ...(mutation.certainty === "possibly-applied"
            ? { code: "mutation_state_uncertain" as const }
            : {}),
        })
      }
      const { ref, createdSecret } = mutation.value
      let facts: AccountKeyResourceFacts | null = null
      try {
        const collection = await session.openCollection(ref.scopeKey, options)
        facts = await collection.get(ref, options)
      } catch {
        // Creation is confirmed. A failed read cannot turn it into another write.
      }
      return { ref, facts, ...(createdSecret ? { createdSecret } : {}) }
    })()
    return result
  }
  if (requirements.length === 1) {
    return requirements[0].provisioning.kind === "automatic"
      ? { kind: "ready", create: () => create(requirements[0].requirementKey) }
      : { kind: "input-required" }
  }
  return { kind: "selection-required", requirements, create }
}

/** Only observed facts can authorize runtime behavior; a bare reference is not an unrestricted key. */
export function getCreatedAccountRuntimeKey(
  account: DisplaySiteData,
  result: AccountKeyCreationResult,
): AccountRuntimeKey | null {
  return result.facts?.runtimeKey
    ? buildAccountKeyResourceRuntimeKeyFromFacts(
        account,
        result.facts,
        result.createdSecret?.secret,
      )
    : null
}

/** Restore selection after a refresh without guessing by name or list order. */
export function getCreatedAccountRuntimeKeyId(
  result: AccountKeyCreationResult,
): string | null {
  return result.ref ? buildAccountKeyResourceRuntimeKeyId(result.ref) : null
}

/** Recovery is read-only and uses the returned reference, never name or list position. */
export async function resolveCreatedAccountRuntimeKey(
  account: DisplaySiteData,
  result: AccountKeyCreationResult,
  options: ResourceOperationOptions = {},
): Promise<AccountRuntimeKey | null> {
  const known = getCreatedAccountRuntimeKey(account, result)
  if (known || !result.ref) return known
  const id = getCreatedAccountRuntimeKeyId(result)
  const inventory = await fetchDisplayAccountRuntimeKeys(account, options)
  const key = inventory.find((candidate) => candidate.id === id)
  return key
    ? {
        ...key,
        ...(result.createdSecret
          ? { secret: result.createdSecret.secret }
          : {}),
      }
    : null
}

/** A transient source signature for cancellation/deduplication; never display or persist it. */
export function accountKeySourceSignature(
  account: DisplaySiteData | null,
): string {
  return JSON.stringify(
    account && [
      account.id,
      account.siteType,
      account.baseUrl,
      account.authType,
      account.userId,
      account.token,
      account.cookieAuthSessionCookie,
      account.disabled,
    ],
  )
}

export type EnsureAccountKeyResult =
  | { kind: "ready"; runtimeKey: AccountRuntimeKey }
  | {
      kind: "created"
      creation: AccountKeyCreationResult
      runtimeKey: AccountRuntimeKey | null
    }
  | { kind: "input-required"; reason: "editor" | "one-time-secret" }

const automaticEnsures = new Map<
  string,
  {
    readonly promise: Promise<EnsureAccountKeyResult>
    readonly optionsKey: string
    readonly signal?: AbortSignal
  }
>()
const uncertainCreations = new Map<string, AccountKeyResourceError>()
const unreconciledCreations = new Set<string>()

/** Shares inventory and creation for concurrent callers, and reconciles uncertain writes by reading only. */
export async function ensureAccountKey(
  account: DisplaySiteData,
  options: Options & { allowOneTimeSecret?: boolean } = {},
): Promise<EnsureAccountKeyResult> {
  options.signal?.throwIfAborted()
  const signature = accountKeySourceSignature(account)
  const optionsKey = JSON.stringify([
    options.allowOneTimeSecret ?? false,
    options.intent,
    options.protectionBypassExecution,
  ])
  const pending = automaticEnsures.get(signature)
  if (pending) {
    if (pending.optionsKey === optionsKey && pending.signal === options.signal)
      return pending.promise
    // Different owners serialize writes, then re-read with their own cancellation and disclosure policy.
    await awaitAbortableAccountKeyResourceOperation(
      () => pending.promise.catch(() => undefined),
      options.signal,
    )
    return ensureAccountKey(account, options)
  }
  const run = (async (): Promise<EnsureAccountKeyResult> => {
    const inventory = await fetchDisplayAccountRuntimeKeys(account, options)
    options.signal?.throwIfAborted()
    const existing = [...inventory].reverse().find((key) => {
      if (key.status !== "active") return false
      const intent = options.intent
      if (
        intent?.modelContext &&
        !isAccountRuntimeKeyCompatibleWithModel(key, {
          id: intent.modelContext.modelId,
          enableGroups: intent.allowedGroups,
        })
      )
        return false
      const groups = intent?.preferredGroup?.trim()
        ? [intent.preferredGroup.trim()]
        : intent?.allowedGroups?.map((group) => group.trim())
      return (
        !groups ||
        key.modelAccess.groups === null ||
        key.modelAccess.groups.some((group) => groups.includes(group))
      )
    })
    if (existing) {
      uncertainCreations.delete(signature)
      unreconciledCreations.delete(signature)
      return { kind: "ready", runtimeKey: existing }
    }
    const uncertainty = uncertainCreations.get(signature)
    if (uncertainty) throw uncertainty
    if (unreconciledCreations.has(signature))
      return { kind: "input-required", reason: "editor" }
    const { accountKeyResources } = createDisplayAccountApiContext(account)
    if (!accountKeyResources)
      throw new AccountKeyResourceError({ code: "unavailable" })
    if (
      !options.allowOneTimeSecret &&
      getInventorySecretAvailability(accountKeyResources) !==
        INVENTORY_SECRET_AVAILABILITIES.Recoverable
    ) {
      return { kind: "input-required", reason: "one-time-secret" }
    }
    const plan = await prepareDefaultAccountKeyCreation(account, options)
    if (plan.kind !== "ready")
      return { kind: "input-required", reason: "editor" }
    options.signal?.throwIfAborted()
    const creation = await plan.create()
    // Keep only a write guard, never a response-only secret. Eventual consistency must not create duplicates.
    unreconciledCreations.add(signature)
    return {
      kind: "created",
      creation,
      runtimeKey: getCreatedAccountRuntimeKey(account, creation),
    }
  })()
  automaticEnsures.set(signature, {
    promise: run,
    optionsKey,
    signal: options.signal,
  })
  const release = () => {
    if (automaticEnsures.get(signature)?.promise === run)
      automaticEnsures.delete(signature)
  }
  void run.then(release, (error: unknown) => {
    if (
      error instanceof AccountKeyResourceError &&
      error.failure.code === "mutation_state_uncertain"
    ) {
      // Retain only the failure code; upstream messages can contain sensitive response details.
      uncertainCreations.set(
        signature,
        new AccountKeyResourceError({ code: "mutation_state_uncertain" }),
      )
    }
    release()
  })
  return run
}
