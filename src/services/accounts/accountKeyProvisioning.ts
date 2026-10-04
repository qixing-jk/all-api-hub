import {
  accountKeySourceSignature,
  prepareDefaultAccountKeyCreation,
  type AccountKeyCreationResult,
} from "~/services/accounts/accountKeyCreation"
import { analyzeAccountKeyProvisioningSnapshot } from "~/services/accounts/accountKeyInventoryReconciliation"
import {
  createDisplayAccountApiContext,
  fetchDisplayAccountRuntimeKeys,
} from "~/services/accounts/utils/apiServiceRequest"
import { ACCOUNT_SITE_ADAPTER_FAMILIES } from "~/services/accountSiteDefinitions/contracts"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import {
  AccountKeyResourceError,
  type AccountKeyResourceEditor,
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

/** Holds only write state, never a response-only secret, across foreground reopenings. */
const assertWritable = (identity: string) => {
  const guard = writeGuards.get(identity)
  if (guard)
    throw new AccountKeyResourceError({
      code: guard === "uncertain" ? "mutation_state_uncertain" : "unavailable",
    })
}

/** A confirmed or uncertain write belongs to this plan and must never be replayed. */
function once(
  identity: string,
  operation: (
    values?: EditableResourceProjection,
  ) => Promise<AccountKeyCreationResult>,
) {
  let pending: Promise<AccountKeyCreationResult> | undefined
  return (values?: EditableResourceProjection) =>
    (pending ??= Promise.resolve().then(async () => {
      assertWritable(identity)
      writeGuards.set(identity, "pending")
      try {
        const result = await operation(values)
        writeGuards.set(identity, "applied")
        return result
      } catch (error) {
        if (
          error instanceof AccountKeyResourceError &&
          error.failure.code === "mutation_state_uncertain"
        )
          writeGuards.set(identity, "uncertain")
        else writeGuards.delete(identity)
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
  const source = accountKeySourceSignature(account)
  const identity = (key: string) => JSON.stringify([source, key])
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
  const scope = await session.resolveDefaultScope(options)
  const editorEntry = (
    key: string,
    label: string,
    editor: AccountKeyResourceEditor,
  ): AccountKeyProvisioningEntry => ({
    key,
    label,
    editor,
    create: once(identity(key), async (values) => {
      options.signal?.throwIfAborted()
      const projection = values ?? editor.initialValues
      const validation = editor.validate(projection)
      if (!validation.valid)
        throw new AccountKeyResourceError({
          code: "validation_failed",
          fieldIssues: validation.issues,
        })
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
        getAccountSiteDefinition(account.siteType)?.adapterFamily ===
          ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily
      )
        return prepareAccountKeyProvisioning(account, "default", options)
      throw new AccountKeyResourceError({ code: "unavailable" })
    }
    for (const requirement of snapshot.requirements) {
      options.signal?.throwIfAborted()
      if (analysis.coveredRequirementKeys.has(requirement.requirementKey)) {
        writeGuards.delete(identity(requirement.requirementKey))
        continue
      }
      assertWritable(identity(requirement.requirementKey))
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
          create: once(identity(requirement.requirementKey), async () => {
            options.signal?.throwIfAborted()
            const result = await provisioning.provision(
              requirement.requirementKey,
              options,
            )
            if (result.certainty !== "applied")
              throw new AccountKeyResourceError({
                ...result.failure,
                ...(result.certainty === "possibly-applied"
                  ? { code: "mutation_state_uncertain" as const }
                  : {}),
              })
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
          }),
        })
      }
    }
    return { coveredCount: analysis.coveredRequirementKeys.size, entries }
  }

  const inventory = await fetchDisplayAccountRuntimeKeys(account, options)
  if (inventory.some((key) => key.status === "active")) {
    writeGuards.delete(identity("default"))
    return { coveredCount: 1, entries: [] }
  }
  assertWritable(identity("default"))
  const defaultPlan = await prepareDefaultAccountKeyCreation(account, options)
  if (defaultPlan.kind === "ready")
    return {
      coveredCount: 0,
      entries: [
        {
          key: "default",
          label: account.name,
          create: once(identity("default"), () => defaultPlan.create()),
        },
      ],
    }
  // Both manual defaults and ambiguous requirement selection use the native editor.
  return {
    coveredCount: 0,
    entries: [
      editorEntry(
        "default",
        account.name,
        await session.openCreateEditor(scope.scopeKey, options),
      ),
    ],
  }
}
