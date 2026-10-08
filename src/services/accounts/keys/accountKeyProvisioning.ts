import {
  accountKeySourceSignature,
  prepareDefaultAccountKeyCreation,
  type AccountKeyCreationPlan,
  type AccountKeyCreationResult,
} from "~/services/accounts/keys/accountKeyCreation"
import { analyzeAccountKeyProvisioningSnapshot } from "~/services/accounts/keys/accountKeyInventoryReconciliation"
import {
  createDisplayAccountApiContext,
  fetchDisplayAccountRuntimeKeys,
} from "~/services/accounts/utils/apiServiceRequest"
import {
  AccountKeyResourceError,
  type AccountKeyResourceEditor,
  type AccountKeyResourceSession,
  type EditableResourceProjection,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { DisplaySiteData } from "~/types"
import type { AccountKeyAutoProvisionMode } from "~/types/accountKeyAutoProvisioning"

export type AccountKeyProvisioningEntry = {
  readonly key: string
  readonly label: string
  readonly editor?: AccountKeyResourceEditor
  create(values?: EditableResourceProjection): Promise<AccountKeyCreationResult>
}

export type AccountKeyProvisioningPlan = {
  readonly coveredCount: number
  readonly entries: readonly AccountKeyProvisioningEntry[]
}

type Options = ResourceOperationOptions & {
  protectionBypassExecution?: ProtectionBypassExecution
}

const writeGuards = new Map<string, "pending" | "applied" | "uncertain">()
type WriteGuards = typeof writeGuards

type AccountKeyProvisioningSource = {
  readonly identity: string
  readonly label: string
  readonly session: AccountKeyResourceSession
  hasUsableRuntimeKey(options: ResourceOperationOptions): Promise<boolean>
  prepareDefaultCreation(
    options: ResourceOperationOptions,
  ): Promise<AccountKeyCreationPlan>
}

/** Local resource sessions share planning without retaining guards across preview restarts. */
export function createAccountKeyProvisioningPlanner(
  source: AccountKeyProvisioningSource,
) {
  const guards: WriteGuards = new Map()
  return (mode: AccountKeyAutoProvisionMode, options: Options = {}) =>
    preparePlan(source, mode, options, guards)
}

/** Holds only write state, never a response-only secret, across foreground reopenings. */
const assertWritable = (guards: WriteGuards, identity: string) => {
  const guard = guards.get(identity)
  if (guard)
    throw new AccountKeyResourceError({
      code: guard === "uncertain" ? "mutation_state_uncertain" : "unavailable",
    })
}

/** A confirmed or uncertain write belongs to this plan and must never be replayed. */
function once(
  guards: WriteGuards,
  identity: string,
  operation: (
    values: EditableResourceProjection | undefined,
    markWriteStarted: () => void,
  ) => Promise<AccountKeyCreationResult>,
) {
  let pending: Promise<AccountKeyCreationResult> | undefined
  return (values?: EditableResourceProjection) =>
    (pending ??= Promise.resolve().then(async () => {
      assertWritable(guards, identity)
      guards.set(identity, "pending")
      let writeStarted = false
      try {
        const result = await operation(values, () => {
          writeStarted = true
        })
        guards.set(identity, "applied")
        return result
      } catch (error) {
        if (
          (error instanceof AccountKeyResourceError &&
            error.failure.code === "mutation_state_uncertain") ||
          (writeStarted &&
            !(
              error instanceof AccountKeyResourceError &&
              error.mutationCertainty === "not-applied"
            ))
        ) {
          guards.set(identity, "uncertain")
          if (
            error instanceof AccountKeyResourceError &&
            error.failure.code === "mutation_state_uncertain"
          )
            throw error
          throw new AccountKeyResourceError(
            { code: "mutation_state_uncertain" },
            "possibly-applied",
          )
        } else {
          guards.delete(identity)
          pending = undefined
        }
        throw error
      }
    }))
}

/** Prepares every foreground interaction before writing; adapters own placement identities. */
export async function prepareAccountKeyProvisioning(
  account: DisplaySiteData,
  mode: AccountKeyAutoProvisionMode,
  options: Options = {},
): Promise<AccountKeyProvisioningPlan> {
  options.signal?.throwIfAborted()
  const { accountKeyResources, request } =
    createDisplayAccountApiContext(account)
  if (!accountKeyResources)
    throw new AccountKeyResourceError({ code: "unavailable" })
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
  return preparePlan(
    {
      identity: accountKeySourceSignature(account),
      label: account.name,
      session,
      hasUsableRuntimeKey: async (operationOptions) =>
        (
          await fetchDisplayAccountRuntimeKeys(account, {
            ...options,
            ...operationOptions,
          })
        ).some((key) => key.status === "active"),
      prepareDefaultCreation: (operationOptions) =>
        prepareDefaultAccountKeyCreation(account, {
          ...options,
          ...operationOptions,
        }),
    },
    mode,
    options,
    writeGuards,
  )
}

/** Plans against adapter facts while keeping coverage, validation and write guards in one owner. */
async function preparePlan(
  source: AccountKeyProvisioningSource,
  mode: AccountKeyAutoProvisionMode,
  options: Options,
  guards: WriteGuards,
): Promise<AccountKeyProvisioningPlan> {
  options.signal?.throwIfAborted()
  const { session } = source
  const identity = (key: string) => JSON.stringify([source.identity, key])
  const scope = await session.resolveDefaultScope(options)
  const editorEntry = (
    key: string,
    label: string,
    editor: AccountKeyResourceEditor,
  ): AccountKeyProvisioningEntry => ({
    key,
    label,
    editor,
    create: once(guards, identity(key), async (values, markWriteStarted) => {
      options.signal?.throwIfAborted()
      const projection = values ?? editor.initialValues
      const validation = editor.validate(projection)
      if (!validation.valid)
        throw new AccountKeyResourceError({
          code: "validation_failed",
          fieldIssues: validation.issues,
        })
      markWriteStarted()
      const created = await editor.submit(projection, options)
      return { ...created, ref: created.facts?.ref ?? null }
    }),
  })

  if (mode === "all-groups" && session.provisioning) {
    const provisioning = session.provisioning
    const snapshot = await provisioning.inspect(options)
    const analysis = analyzeAccountKeyProvisioningSnapshot(snapshot)
    if (analysis.incomplete)
      throw new AccountKeyResourceError(
        snapshot.partialFailure ?? { code: "unavailable" },
      )
    const entries: AccountKeyProvisioningEntry[] = []
    if (!snapshot.requirements.length) {
      // Compatible New API deployments may expose no selectable groups. Only
      // a complete empty inventory may enter the native default-key workflow.
      if (
        !snapshot.items.length &&
        snapshot.emptyRequirementsAction === "default-creation"
      )
        return preparePlan(source, "default", options, guards)
      throw new AccountKeyResourceError({ code: "unavailable" })
    }
    for (const requirement of snapshot.requirements) {
      options.signal?.throwIfAborted()
      if (analysis.coveredRequirementKeys.has(requirement.requirementKey)) {
        guards.delete(identity(requirement.requirementKey))
        continue
      }
      assertWritable(guards, identity(requirement.requirementKey))
      if (requirement.provisioning.kind === "input-required") {
        entries.push(
          editorEntry(
            requirement.requirementKey,
            requirement.displayName,
            await session.openCreateEditor(
              scope.scopeKey,
              options,
              undefined,
              requirement.requirementKey,
            ),
          ),
        )
      } else {
        entries.push({
          key: requirement.requirementKey,
          label: requirement.displayName,
          create: once(
            guards,
            identity(requirement.requirementKey),
            async (_values, markWriteStarted) => {
              options.signal?.throwIfAborted()
              markWriteStarted()
              const result = await provisioning.provision(
                requirement.requirementKey,
                options,
              )
              if (result.certainty !== "applied")
                throw new AccountKeyResourceError(
                  {
                    ...result.failure,
                    ...(result.certainty !== "not-applied"
                      ? { code: "mutation_state_uncertain" as const }
                      : {}),
                  },
                  result.certainty === "not-applied"
                    ? "not-applied"
                    : "possibly-applied",
                )
              const { ref, createdSecret } = result.value
              let facts: AccountKeyCreationResult["facts"] = null
              try {
                facts = await (
                  await session.openCollection(ref.scopeKey, options)
                ).get(ref, options)
              } catch {
                /* A failed detail read cannot undo a confirmed write. */
              }
              return { ref, facts, ...(createdSecret ? { createdSecret } : {}) }
            },
          ),
        })
      }
    }
    return { coveredCount: analysis.coveredRequirementKeys.size, entries }
  }

  if (await source.hasUsableRuntimeKey(options)) {
    guards.delete(identity("default"))
    return { coveredCount: 1, entries: [] }
  }
  assertWritable(guards, identity("default"))
  const defaultPlan = await source.prepareDefaultCreation(options)
  if (defaultPlan.kind === "ready")
    return {
      coveredCount: 0,
      entries: [
        {
          key: "default",
          label: source.label,
          create: once(
            guards,
            identity("default"),
            (_values, markWriteStarted) => {
              options.signal?.throwIfAborted()
              markWriteStarted()
              return defaultPlan.create()
            },
          ),
        },
      ],
    }
  // Both manual defaults and ambiguous requirement selection use the native editor.
  return {
    coveredCount: 0,
    entries: [
      editorEntry(
        "default",
        source.label,
        await session.openCreateEditor(scope.scopeKey, options),
      ),
    ],
  }
}
