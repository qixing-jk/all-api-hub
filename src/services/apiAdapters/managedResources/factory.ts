import type { ManagedSiteType } from "~/constants/siteType"
import type { ManagedResourceKind } from "~/services/accountSiteDefinitions/contracts"
import {
  isManagedResourceRefFor,
  MANAGED_RESOURCE_FAILURE_CODES,
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
import type { NativeResourceMutationResult } from "~/services/apiAdapters/contracts/resourceNative"
import {
  assertNativeResourceFacts,
  createNativeEditorSubmitGate,
  createNativeResourceRefBoundary,
  isNativeResourceBoundaryError,
  resolveNativeResourceMutation,
} from "~/services/apiAdapters/nativeResources/factory"

export type { NativeResourceMutationResult } from "~/services/apiAdapters/contracts/resourceNative"

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
  TFailure,
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
  ): Promise<NativeResourceMutationResult<TDetail, TFailure>>
  update(
    config: TConfig,
    detail: TDetail,
    command: TUpdateCommand,
    options?: ResourceOperationOptions,
  ): Promise<NativeResourceMutationResult<TDetail, TFailure>>
  delete(
    config: TConfig,
    locator: TLocator,
    options?: ResourceOperationOptions,
  ): Promise<NativeResourceMutationResult<void, TFailure>>
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

  try {
    return new ManagedResourceError(mapFailure(error))
  } catch {
    return unexpectedDefinitionOutput()
  }
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

/** Creates a public managed-resource registration from a correlated native Adapter definition. */
export function defineNativeResourceKind<
  TConfig,
  TLocator,
  TListItem,
  TDetail,
  TCreateCommand,
  TUpdateCommand,
  TFailure,
>(
  definition: NativeResourceKindDefinition<
    TConfig,
    TLocator,
    TListItem,
    TDetail,
    TCreateCommand,
    TUpdateCommand,
    TFailure
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
          ) => Promise<NativeResourceMutationResult<TDetail, TFailure>>,
          projectResult: (detail: TDetail) => ResourceDisplayFacts,
        ): ResourceEditor => {
          const validate = (values: EditableResourceProjection) => {
            try {
              return editorDefinition.validate(values)
            } catch (error) {
              throw toManagedError(error, mapFailure)
            }
          }

          const submitGate = createNativeEditorSubmitGate({
            validate: (values: EditableResourceProjection) => {
              const validation = validate(values)
              if (!validation.valid) throw invalidPublicInput(validation.issues)
            },
            buildCommand: (values: EditableResourceProjection) => {
              try {
                return editorDefinition.buildCommand(values)
              } catch (error) {
                throw toManagedError(error, mapFailure)
              }
            },
            mutate: (command: TCommand, submitOptions) =>
              mapOperationFailure(
                () => mutate(command, submitOptions),
                mapFailure,
              ),
            resolve: (result) => {
              try {
                const resolution = resolveNativeResourceMutation(result)
                if (resolution.status === "applied") {
                  try {
                    return projectResult(resolution.value)
                  } catch (error) {
                    throw toManagedError(error, mapFailure)
                  }
                }
                if (resolution.status === "not-applied") {
                  throw new ManagedResourceError(mapFailure(resolution.failure))
                }
                throw new ManagedResourceError({
                  code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
                })
              } catch (error) {
                throw toManagedError(error, mapFailure)
              }
            },
            normalizeError: (error) =>
              isNativeResourceBoundaryError(error)
                ? unexpectedDefinitionOutput()
                : toManagedError(error, mapFailure),
            shouldCloseAfterError: (error) => {
              const managedError = toManagedError(error, mapFailure)
              return (
                managedError.failure.code ===
                  MANAGED_RESOURCE_FAILURE_CODES.NotFound ||
                managedError.failure.code ===
                  MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain
              )
            },
            closedError: () => invalidPublicInput(),
          })
          const submit = (
            values: EditableResourceProjection,
            submitOptions?: ResourceOperationOptions,
          ) => submitGate.submit(values, submitOptions)

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
                  )
                }, mapFailure),
          delete: (ref, deleteOptions) =>
            !capabilities.canDelete
              ? rejectUnsupported()
              : mapOperationFailure(async () => {
                  const { locator } = decodeRef(ref)
                  try {
                    const resolution = resolveNativeResourceMutation(
                      await mapOperationFailure(
                        () => definition.delete(config, locator, deleteOptions),
                        mapFailure,
                      ),
                    )
                    if (resolution.status === "not-applied") {
                      throw new ManagedResourceError(
                        mapFailure(resolution.failure),
                      )
                    }
                    if (resolution.status === "uncertain") {
                      throw new ManagedResourceError({
                        code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
                      })
                    }
                  } catch (error) {
                    if (
                      error instanceof ManagedResourceError &&
                      error.failure.code ===
                        MANAGED_RESOURCE_FAILURE_CODES.NotFound
                    ) {
                      return
                    }
                    throw error
                  }
                }, mapFailure),
        }

        return workspace
      }, mapFailure),
  }
}
