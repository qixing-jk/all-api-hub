import type { ManagedSiteType } from "~/constants/siteType"
import type { ManagedResourceKind } from "~/services/accountSiteDefinitions/contracts"
import {
  isManagedResourceRefFor,
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type EditableResourceProjection,
  type ManagedResourceCreateSeed,
  type ManagedResourceCreateSeedKind,
  type ManagedResourceRef,
  type ManagedResourceRegistration,
  type ManagedResourceWorkspace,
  type ResourceDisplayFacts,
  type ResourceEditor,
  type ResourceFailure,
  type ResourceFieldDescriptor,
  type ResourceFieldOption,
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
  loadOptions?: (
    fieldId: string,
    values: EditableResourceProjection,
    options?: ResourceOperationOptions,
  ) => Promise<readonly ResourceFieldOption[]>
}

export type NativeResourceCreateSeedBinding = {
  [TKind in ManagedResourceCreateSeedKind]: {
    kind: TKind
    project(
      seed: Extract<ManagedResourceCreateSeed, { kind: TKind }>,
    ): EditableResourceProjection
  }
}[ManagedResourceCreateSeedKind]

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
  createSeedBindings?: readonly NativeResourceCreateSeedBinding[]
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
  /** Projects a mutation result into the provider's collection row shape. */
  toMutationFacts?(
    detail: TDetail,
    ref: ManagedResourceRef,
  ): ResourceDisplayFacts
  createEditor(
    config: TConfig,
    options?: ResourceOperationOptions,
  ): Promise<NativeResourceEditorDefinition<TCreateCommand>>
  editEditor(
    config: TConfig,
    detail: TDetail,
    options?: ResourceOperationOptions,
  ):
    | NativeResourceEditorDefinition<TUpdateCommand>
    | Promise<NativeResourceEditorDefinition<TUpdateCommand>>
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
  assertManagedSiteMutationResult<T, ManagedSiteMutationConfirmedEffect>(
    result,
    options,
  )
}

const uncertainMutationResult = <T>(
  raw?: unknown,
): ManagedSiteMutationResult<T> => ({
  outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
  diagnostic: {
    message: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
    ...(raw === undefined ? {} : { raw }),
  },
})

const rejectedPublicInput = <T>(): ManagedSiteMutationResult<T> => ({
  outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
  diagnostic: { message: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed },
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
  const createSeedKinds =
    definition.createSeedBindings?.map((binding) => binding.kind) ?? []

  return {
    siteType: definition.siteType,
    kind: definition.kind,
    createSeedKinds,
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

        const readResourceAbsence = async (
          ref: ManagedResourceRef,
          readOptions?: ResourceOperationOptions,
        ): Promise<
          | { state: "absent" }
          | { state: "present" }
          | { state: "unknown"; raw: unknown }
        > => {
          try {
            await readDetail(ref, readOptions)
            return { state: "present" }
          } catch (error) {
            const managedError = toManagedError(error, mapFailure)
            if (
              managedError.failure.code ===
              MANAGED_RESOURCE_FAILURE_CODES.NotFound
            ) {
              return { state: "absent" }
            }
            return { state: "unknown", raw: error }
          }
        }

        const isRejectedNotFound = (
          result: Extract<
            ManagedSiteMutationResult<void>,
            { outcome: typeof MANAGED_SITE_MUTATION_OUTCOMES.Rejected }
          >,
        ) => {
          if (
            result.diagnostic.code === MANAGED_RESOURCE_FAILURE_CODES.NotFound
          ) {
            return true
          }
          return (
            mapFailure(result.diagnostic.raw ?? result.diagnostic).code ===
            MANAGED_RESOURCE_FAILURE_CODES.NotFound
          )
        }

        const projectMutationFacts = (
          detail: TDetail,
          ref: ManagedResourceRef,
        ) => {
          try {
            const facts = definition.toMutationFacts
              ? definition.toMutationFacts(detail, ref)
              : definition.toDetailFacts(detail, ref)
            return assertNativeResourceFacts(facts, ref, refBoundary.refsMatch)
          } catch (error) {
            if (isNativeResourceBoundaryError(error)) {
              throw unexpectedDefinitionOutput()
            }
            throw error
          }
        }

        const projectCreatedDetail = (detail: TDetail) =>
          projectMutationFacts(detail, refFromDetail(detail))

        const projectDetailAtRef = (
          detail: TDetail,
          expectedRef: ManagedResourceRef,
        ) => {
          assertDetailIdentity(detail, expectedRef)
          return projectMutationFacts(detail, expectedRef)
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
          let inflight:
            | Promise<ManagedSiteMutationResult<ResourceDisplayFacts>>
            | undefined
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
            if (closed)
              return Promise.resolve(
                rejectedPublicInput<ResourceDisplayFacts>(),
              )

            const run = (async () => {
              const validation = validate(values)
              if (!validation.valid)
                return rejectedPublicInput<ResourceDisplayFacts>()
              let command: TCommand
              try {
                command = editorDefinition.buildCommand(values)
              } catch (error) {
                const managedError = toManagedError(error, mapFailure)
                closeForTerminalFailure(managedError)
                throw managedError
              }

              let candidate: unknown
              try {
                candidate = await mutate(command, submitOptions)
              } catch (error) {
                if (error instanceof ManagedResourceError) {
                  closeForTerminalFailure(error)
                } else {
                  closed = true
                }
                throw error
              }

              try {
                assertDefinitionMutationResult<TDetail>(
                  candidate,
                  mutationOptions,
                )
              } catch (error) {
                closed = true
                throw error
              }
              const result = candidate
              if (result.outcome !== MANAGED_SITE_MUTATION_OUTCOMES.Rejected) {
                closed = true
              }

              switch (result.outcome) {
                case MANAGED_SITE_MUTATION_OUTCOMES.Succeeded:
                  return { ...result, data: projectResult(result.data) }
                case MANAGED_SITE_MUTATION_OUTCOMES.Partial:
                  if (result.data === undefined) {
                    // No provider detail crosses the public boundary in this
                    // branch, so the checked envelope is already public-safe.
                    return result as ManagedSiteMutationResult<ResourceDisplayFacts>
                  }
                  return { ...result, data: projectResult(result.data) }
                case MANAGED_SITE_MUTATION_OUTCOMES.Rejected:
                case MANAGED_SITE_MUTATION_OUTCOMES.Uncertain:
                  return result
              }
            })()

            const tracked = run.finally(() => {
              if (inflight === tracked) inflight = undefined
            })
            inflight = tracked
            return tracked
          }

          const loadSecretCallback = editorDefinition.loadSecret
          const loadOptionsCallback = editorDefinition.loadOptions
          return {
            fields: editorDefinition.fields,
            initialValues: editorDefinition.initialValues,
            validate,
            ...(loadSecretCallback
              ? {
                  loadSecret: (
                    fieldId: string,
                    operationOptions?: ResourceOperationOptions,
                  ) =>
                    mapOperationFailure(
                      () => loadSecretCallback(fieldId, operationOptions),
                      mapFailure,
                    ),
                }
              : {}),
            ...(loadOptionsCallback
              ? {
                  loadOptions: (
                    fieldId: string,
                    values: EditableResourceProjection,
                    operationOptions?: ResourceOperationOptions,
                  ) =>
                    mapOperationFailure(
                      () =>
                        loadOptionsCallback(fieldId, values, operationOptions),
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
                  const createSeed = editorOptions?.seed
                  const createSeedBinding = createSeed
                    ? definition.createSeedBindings?.find(
                        (binding) => binding.kind === createSeed.kind,
                      )
                    : undefined
                  if (createSeed && !createSeedBinding) {
                    throw invalidPublicInput()
                  }
                  const seedProjection =
                    createSeed && createSeedBinding
                      ? createSeedBinding.project(createSeed)
                      : undefined
                  const editorDefinition = await definition.createEditor(
                    config,
                    editorOptions?.signal
                      ? { signal: editorOptions.signal }
                      : undefined,
                  )
                  return createEditor(
                    seedProjection
                      ? {
                          ...editorDefinition,
                          initialValues: {
                            ...editorDefinition.initialValues,
                            ...seedProjection,
                          },
                        }
                      : editorDefinition,
                    async (command, submitOptions) => {
                      return definition.create(config, command, submitOptions)
                    },
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
                  const editorDefinition = await definition.editEditor(
                    config,
                    editorDetail,
                    editorOptions?.signal
                      ? { signal: editorOptions.signal }
                      : undefined,
                  )
                  return createEditor(
                    editorDefinition,
                    async (command, submitOptions) => {
                      let latestDetail: TDetail
                      try {
                        latestDetail = (
                          await readDetail(canonicalRef, submitOptions)
                        ).detail
                      } catch (error) {
                        // This authoritative read occurs before update dispatch,
                        // so it remains a controlled read/setup error.
                        throw toManagedError(error, mapFailure)
                      }
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
                  const candidate: unknown = await definition.delete(
                    config,
                    locator,
                    deleteOptions,
                  )
                  assertDefinitionMutationResult<void>(candidate, {
                    idempotent: true,
                  })
                  const result = candidate
                  if (
                    result.outcome ===
                      MANAGED_SITE_MUTATION_OUTCOMES.Succeeded &&
                    result.confirmedEffects.length === 0
                  ) {
                    const absence = await readResourceAbsence(
                      canonicalRef,
                      deleteOptions,
                    )
                    if (absence.state === "absent") return result
                    if (absence.state === "present") {
                      throw unexpectedDefinitionOutput()
                    }
                    return uncertainMutationResult<void>(absence.raw)
                  }

                  if (
                    result.outcome ===
                      MANAGED_SITE_MUTATION_OUTCOMES.Rejected &&
                    isRejectedNotFound(result)
                  ) {
                    const absence = await readResourceAbsence(
                      canonicalRef,
                      deleteOptions,
                    )
                    if (absence.state === "absent") {
                      return {
                        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
                        data: undefined,
                        confirmedEffects: [],
                      }
                    }
                    if (absence.state === "unknown") {
                      return uncertainMutationResult<void>(absence.raw)
                    }
                  }
                  return result
                })(),
        }

        return workspace
      }, mapFailure),
  }
}
