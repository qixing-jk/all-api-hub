import type { ManagedSiteType } from "~/constants/siteType"
import type { ManagedResourceKind } from "~/services/accountSiteDefinitions/contracts"
import {
  isManagedResourceRefFor,
  MANAGED_RESOURCE_FAILURE_CODES,
  MANAGED_RESOURCE_FIELD_TYPES,
  ManagedResourceError,
  type EditableResourceProjection,
  type ManagedResourceRef,
  type ManagedResourceRegistration,
  type ManagedResourceWorkspace,
  type ResourceDisplayFacts,
  type ResourceEditor,
  type ResourceFailure,
  type ResourceFieldDescriptor,
  type ResourceListQuery,
  type ResourceOperationOptions,
  type ResourceValidationResult,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  assertNativeResourceFacts,
  createNativeResourceRefBoundary,
  isNativeResourceBoundaryError,
} from "~/services/apiAdapters/nativeResources/factory"
import {
  assertManagedSiteMutationResult,
  MANAGED_SITE_MUTATION_OUTCOMES,
  toPrivateManagedSiteMutationOutput,
  type ManagedSiteMutationConfirmedEffect,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"

export type NativeResourcePage<TItem> = {
  items: readonly TItem[]
  total?: number
  nextCursor?: string
}

export type NativeResourceEditorDefinition<TCommand> = {
  fields: readonly ResourceFieldDescriptor[]
  initialValues: EditableResourceProjection
  validate(values: EditableResourceProjection): ResourceValidationResult
  buildCommand(values: EditableResourceProjection): TCommand
  loadSecret?: (
    fieldId: string,
    options?: ResourceOperationOptions,
  ) => Promise<string>
}

export type NativeResourceKindDefinition<
  TConfig,
  TLocator,
  TListItem,
  TDetail,
  TCreateCommand,
  TUpdateCommand,
> = {
  siteType: ManagedSiteType
  kind: ManagedResourceKind
  capabilities?: Partial<ManagedResourceWorkspace["capabilities"]>
  openConfig(options?: ResourceOperationOptions): Promise<TConfig>
  scopeKey(config: TConfig): string
  encodeLocator(locator: TLocator): string
  decodeLocator(resourceId: string): TLocator
  locatorFromListItem(item: TListItem): TLocator
  locatorFromDetail(detail: TDetail): TLocator
  list(
    config: TConfig,
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ): Promise<NativeResourcePage<TListItem>>
  get(
    config: TConfig,
    locator: TLocator,
    options?: ResourceOperationOptions,
  ): Promise<TDetail>
  toListFacts(item: TListItem, ref: ManagedResourceRef): ResourceDisplayFacts
  toDetailFacts(detail: TDetail, ref: ManagedResourceRef): ResourceDisplayFacts
  createEditor(
    config: TConfig,
    options?: ResourceOperationOptions,
  ): Promise<NativeResourceEditorDefinition<TCreateCommand>>
  editEditor(
    config: TConfig,
    detail: TDetail,
  ): NativeResourceEditorDefinition<TUpdateCommand>
  sanitizeEditDetail?(detail: TDetail): TDetail
  create(
    config: TConfig,
    command: TCreateCommand,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<TDetail>>
  update(
    config: TConfig,
    detail: TDetail,
    command: TUpdateCommand,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<TDetail>>
  delete(
    config: TConfig,
    locator: TLocator,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<void>>
  mapFailure(error: unknown): ResourceFailure
}

const invalidPublicInput = (fieldIssues?: ResourceFailure["fieldIssues"]) =>
  new ManagedResourceError({
    code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    ...(fieldIssues === undefined ? {} : { fieldIssues }),
  })

const unexpectedDefinitionOutput = () =>
  new ManagedResourceError({
    code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected,
  })

const toManagedError = (
  error: unknown,
  mapFailure: (error: unknown) => ResourceFailure,
) => {
  if (error instanceof ManagedResourceError) return error

  let failure: ResourceFailure
  try {
    failure = mapFailure(error)
  } catch {
    throw error
  }

  return new ManagedResourceError(failure)
}

const mapOperationFailure = async <T>(
  operation: () => T | Promise<T>,
  mapFailure: (error: unknown) => ResourceFailure,
): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    throw toManagedError(error, mapFailure)
  }
}

/** Validates untrusted native-definition output before public projection. */
function assertDefinitionMutationResult<T>(
  result: unknown,
  options: { idempotent: boolean },
): asserts result is ManagedSiteMutationResult<T> {
  try {
    assertManagedSiteMutationResult<T, ManagedSiteMutationConfirmedEffect>(
      result,
      options,
    )
  } catch {
    throw unexpectedDefinitionOutput()
  }
}

// Task 10 removes this private compatibility projection when public native
// resource callers consume ManagedSiteMutationResult directly.
const toPublicMutation = <T>(
  result: ManagedSiteMutationResult<T>,
  mapFailure: (failure: unknown) => ResourceFailure,
  knownSecrets: readonly string[] = [],
): T => {
  if (result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Succeeded) {
    return result.data
  }

  const output = toPrivateManagedSiteMutationOutput(result, {
    knownSecrets,
  })
  if (result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Rejected) {
    const failure = mapFailure(result.diagnostic.raw ?? result.diagnostic)
    throw new ManagedResourceError(
      failure,
      output.message ? { privateMessage: output.message } : undefined,
    )
  }

  throw new ManagedResourceError(
    { code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain },
    output.message ? { privateMessage: output.message } : undefined,
  )
}

const collectEditorSecrets = (
  fields: readonly ResourceFieldDescriptor[],
  values: EditableResourceProjection,
) =>
  fields.flatMap((field) => {
    if (field.type !== MANAGED_RESOURCE_FIELD_TYPES.Secret) return []
    const value = values[field.fieldId]
    if (typeof value === "string") return value ? [value] : []
    return typeof value === "object" &&
      value !== null &&
      "kind" in value &&
      value.kind === "replace" &&
      "value" in value &&
      value.value
      ? [value.value]
      : []
  })
/** Creates a public managed-resource registration from a correlated native Adapter definition. */
export function defineNativeResourceKind<
  TConfig,
  TLocator,
  TListItem,
  TDetail,
  TCreateCommand,
  TUpdateCommand,
>(
  definition: NativeResourceKindDefinition<
    TConfig,
    TLocator,
    TListItem,
    TDetail,
    TCreateCommand,
    TUpdateCommand
  >,
): ManagedResourceRegistration {
  const mapFailure = (error: unknown) => definition.mapFailure(error)

  return {
    siteType: definition.siteType,
    kind: definition.kind,
    open: (options) =>
      mapOperationFailure(async () => {
        const config = await definition.openConfig(options)
        const scopeKey = definition.scopeKey(config)
        if (
          typeof scopeKey !== "string" ||
          scopeKey.length === 0 ||
          scopeKey.length > 2048
        ) {
          throw unexpectedDefinitionOutput()
        }

        const refBoundary = createNativeResourceRefBoundary<
          ManagedResourceRef,
          TLocator
        >({
          scopeKey,
          encodeLocator: definition.encodeLocator,
          decodeLocator: definition.decodeLocator,
          buildRef: (resourceId) => ({
            siteType: definition.siteType,
            kind: definition.kind,
            scopeKey,
            resourceId,
          }),
          matchesRef: (value): value is ManagedResourceRef =>
            isManagedResourceRefFor(value, {
              siteType: definition.siteType,
              kind: definition.kind,
              scopeKey,
            }),
        })
        const createRef = (locator: TLocator): ManagedResourceRef => {
          try {
            return refBoundary.createRef(locator)
          } catch (error) {
            if (isNativeResourceBoundaryError(error)) {
              throw unexpectedDefinitionOutput()
            }
            throw error
          }
        }
        const decodeRef = (candidate: unknown) => {
          try {
            return refBoundary.decodeRef(candidate)
          } catch (error) {
            if (isNativeResourceBoundaryError(error)) {
              throw invalidPublicInput()
            }
            throw error
          }
        }

        const refFromDetail = (detail: TDetail) =>
          createRef(definition.locatorFromDetail(detail))

        const assertDetailIdentity = (
          detail: TDetail,
          expectedRef: ManagedResourceRef,
        ) => {
          if (!refBoundary.refsMatch(refFromDetail(detail), expectedRef)) {
            throw unexpectedDefinitionOutput()
          }
        }

        const readDetail = async (
          candidate: unknown,
          readOptions?: ResourceOperationOptions,
        ) => {
          const { ref, locator } = decodeRef(candidate)
          const detail = await definition.get(config, locator, readOptions)
          assertDetailIdentity(detail, ref)
          return { ref, detail }
        }

        const confirmResourceAbsent = async (
          ref: ManagedResourceRef,
          readOptions?: ResourceOperationOptions,
          resourcePresentError?: unknown,
        ) => {
          try {
            await readDetail(ref, readOptions)
          } catch (error) {
            const managedError = toManagedError(error, mapFailure)
            if (
              managedError.failure.code ===
              MANAGED_RESOURCE_FAILURE_CODES.NotFound
            ) {
              return
            }
            throw managedError
          }
          throw resourcePresentError ?? unexpectedDefinitionOutput()
        }

        const projectCreatedDetail = (detail: TDetail) => {
          const ref = refFromDetail(detail)
          try {
            return assertNativeResourceFacts(
              definition.toDetailFacts(detail, ref),
              ref,
              refBoundary.refsMatch,
            )
          } catch (error) {
            if (isNativeResourceBoundaryError(error)) {
              throw unexpectedDefinitionOutput()
            }
            throw error
          }
        }

        const projectDetailAtRef = (
          detail: TDetail,
          expectedRef: ManagedResourceRef,
        ) => {
          assertDetailIdentity(detail, expectedRef)
          try {
            return assertNativeResourceFacts(
              definition.toDetailFacts(detail, expectedRef),
              expectedRef,
              refBoundary.refsMatch,
            )
          } catch (error) {
            if (isNativeResourceBoundaryError(error)) {
              throw unexpectedDefinitionOutput()
            }
            throw error
          }
        }

        const createEditor = <TCommand>(
          editorDefinition: NativeResourceEditorDefinition<TCommand>,
          mutate: (
            command: TCommand,
            options?: ResourceOperationOptions,
          ) => Promise<ManagedSiteMutationResult<TDetail>>,
          projectResult: (detail: TDetail) => ResourceDisplayFacts,
          mutationOptions: { idempotent: boolean },
        ): ResourceEditor => {
          let closed = false
          let inflight: Promise<ResourceDisplayFacts> | undefined
          const closeForTerminalFailure = (error: ManagedResourceError) => {
            if (
              error.failure.code === MANAGED_RESOURCE_FAILURE_CODES.NotFound ||
              error.failure.code ===
                MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain
            ) {
              closed = true
            }
          }

          const validate = (values: EditableResourceProjection) => {
            try {
              return editorDefinition.validate(values)
            } catch (error) {
              throw toManagedError(error, mapFailure)
            }
          }

          const submit = (
            values: EditableResourceProjection,
            submitOptions?: ResourceOperationOptions,
          ) => {
            if (inflight !== undefined) return inflight
            if (closed) return Promise.reject(invalidPublicInput())

            const run = (async () => {
              const validation = validate(values)
              if (!validation.valid) throw invalidPublicInput()
              const command = editorDefinition.buildCommand(values)
              let result: ManagedSiteMutationResult<TDetail>
              try {
                result = await mutate(command, submitOptions)
              } catch (error) {
                const managedError = toManagedError(error, mapFailure)
                closeForTerminalFailure(managedError)
                throw managedError
              }

              try {
                assertDefinitionMutationResult<TDetail>(result, mutationOptions)
              } catch (error) {
                closed = true
                throw error
              }
              if (result.outcome !== MANAGED_SITE_MUTATION_OUTCOMES.Rejected) {
                closed = true
              }

              let detail: TDetail
              try {
                detail = toPublicMutation(
                  result,
                  mapFailure,
                  collectEditorSecrets(editorDefinition.fields, values),
                )
              } catch (error) {
                if (error instanceof ManagedResourceError) {
                  closeForTerminalFailure(error)
                }
                throw error
              }
              return projectResult(detail)
            })()

            const tracked = run.finally(() => {
              if (inflight === tracked) inflight = undefined
            })
            inflight = tracked
            return tracked
          }

          return {
            fields: editorDefinition.fields,
            initialValues: editorDefinition.initialValues,
            validate,
            ...(editorDefinition.loadSecret
              ? {
                  loadSecret: (
                    fieldId: string,
                    loadOptions?: ResourceOperationOptions,
                  ) =>
                    mapOperationFailure(
                      () => editorDefinition.loadSecret!(fieldId, loadOptions),
                      mapFailure,
                    ),
                }
              : {}),
            submit,
          }
        }

        const capabilities: ManagedResourceWorkspace["capabilities"] = {
          canSearch: definition.capabilities?.canSearch ?? false,
          canCreate: definition.capabilities?.canCreate ?? true,
          canUpdate: definition.capabilities?.canUpdate ?? true,
          canDelete: definition.capabilities?.canDelete ?? true,
        }
        const rejectUnsupported = () => Promise.reject(invalidPublicInput())
        const workspace: ManagedResourceWorkspace = {
          capabilities,
          list: (query, listOptions) =>
            query?.search && !capabilities.canSearch
              ? rejectUnsupported()
              : mapOperationFailure(async () => {
                  const page = await definition.list(config, query, listOptions)
                  const items = page.items.map((item) => {
                    const ref = createRef(definition.locatorFromListItem(item))
                    try {
                      return assertNativeResourceFacts(
                        definition.toListFacts(item, ref),
                        ref,
                        refBoundary.refsMatch,
                      )
                    } catch (error) {
                      if (isNativeResourceBoundaryError(error)) {
                        throw unexpectedDefinitionOutput()
                      }
                      throw error
                    }
                  })
                  return {
                    items,
                    ...(page.total === undefined ? {} : { total: page.total }),
                    ...(page.nextCursor === undefined
                      ? {}
                      : { nextCursor: page.nextCursor }),
                  }
                }, mapFailure),
          get: (ref, getOptions) =>
            mapOperationFailure(async () => {
              const { ref: canonicalRef, detail } = await readDetail(
                ref,
                getOptions,
              )
              try {
                return assertNativeResourceFacts(
                  definition.toDetailFacts(detail, canonicalRef),
                  canonicalRef,
                  refBoundary.refsMatch,
                )
              } catch (error) {
                if (isNativeResourceBoundaryError(error)) {
                  throw unexpectedDefinitionOutput()
                }
                throw error
              }
            }, mapFailure),
          openCreateEditor: (editorOptions) =>
            !capabilities.canCreate
              ? rejectUnsupported()
              : mapOperationFailure(async () => {
                  const editorDefinition = await definition.createEditor(
                    config,
                    editorOptions,
                  )
                  return createEditor(
                    editorDefinition,
                    (command, submitOptions) =>
                      definition.create(config, command, submitOptions),
                    projectCreatedDetail,
                    { idempotent: false },
                  )
                }, mapFailure),
          openEditEditor: (ref, editorOptions) =>
            !capabilities.canUpdate
              ? rejectUnsupported()
              : mapOperationFailure(async () => {
                  const { ref: canonicalRef, detail } = await readDetail(
                    ref,
                    editorOptions,
                  )
                  const editorDetail = definition.sanitizeEditDetail
                    ? definition.sanitizeEditDetail(detail)
                    : detail
                  assertDetailIdentity(editorDetail, canonicalRef)
                  const editorDefinition = definition.editEditor(
                    config,
                    editorDetail,
                  )
                  return createEditor(
                    editorDefinition,
                    async (command, submitOptions) => {
                      const { detail: latestDetail } = await readDetail(
                        canonicalRef,
                        submitOptions,
                      )
                      return definition.update(
                        config,
                        latestDetail,
                        command,
                        submitOptions,
                      )
                    },
                    (updatedDetail) =>
                      projectDetailAtRef(updatedDetail, canonicalRef),
                    { idempotent: true },
                  )
                }, mapFailure),
          delete: (ref, deleteOptions) =>
            !capabilities.canDelete
              ? rejectUnsupported()
              : (async () => {
                  let decodedRef: ReturnType<typeof decodeRef>
                  try {
                    decodedRef = decodeRef(ref)
                  } catch (error) {
                    throw toManagedError(error, mapFailure)
                  }
                  const { ref: canonicalRef, locator } = decodedRef
                  let result: ManagedSiteMutationResult<void>
                  try {
                    result = await definition.delete(
                      config,
                      locator,
                      deleteOptions,
                    )
                  } catch (error) {
                    const managedError = toManagedError(error, mapFailure)
                    if (
                      managedError.failure.code !==
                      MANAGED_RESOURCE_FAILURE_CODES.NotFound
                    ) {
                      throw managedError
                    }
                    await confirmResourceAbsent(
                      canonicalRef,
                      deleteOptions,
                      managedError,
                    )
                    return
                  }

                  assertDefinitionMutationResult<void>(result, {
                    idempotent: true,
                  })
                  if (
                    result.outcome ===
                      MANAGED_SITE_MUTATION_OUTCOMES.Succeeded &&
                    result.confirmedEffects.length === 0
                  ) {
                    await confirmResourceAbsent(canonicalRef, deleteOptions)
                    return
                  }

                  try {
                    toPublicMutation(result, mapFailure)
                  } catch (error) {
                    if (
                      !(error instanceof ManagedResourceError) ||
                      error.failure.code !==
                        MANAGED_RESOURCE_FAILURE_CODES.NotFound
                    ) {
                      throw error
                    }
                    await confirmResourceAbsent(
                      canonicalRef,
                      deleteOptions,
                      error,
                    )
                    return
                  }
                })(),
        }

        return workspace
      }, mapFailure),
  }
}
