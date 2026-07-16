import type { ManagedSiteType } from "~/constants/siteType"
import type { ManagedResourceKind } from "~/services/accountSiteDefinitions/contracts"
import {
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

export type NativeResourceMutationResult<T, TFailure> =
  | { certainty: "applied"; value: T }
  | { certainty: "not-applied"; failure: TFailure }
  | { certainty: "possibly-applied" }
  | { certainty: "partially-applied" }

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
  supportsSearch: boolean
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

const toPublicMutation = async <T, TFailure>(
  operation: () => Promise<NativeResourceMutationResult<T, TFailure>>,
  mapFailure: (failure: TFailure) => ResourceFailure,
): Promise<T> => {
  const result = await operation()
  if (result.certainty === "applied") return result.value
  if (result.certainty === "not-applied") {
    throw new ManagedResourceError(mapFailure(result.failure))
  }
  throw new ManagedResourceError({
    code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
  })
}

const refsMatch = (
  actualRef: ManagedResourceRef,
  expectedRef: ManagedResourceRef,
) =>
  actualRef.siteType === expectedRef.siteType &&
  actualRef.kind === expectedRef.kind &&
  actualRef.scopeKey === expectedRef.scopeKey &&
  actualRef.resourceId === expectedRef.resourceId

const assertValidFacts = (
  facts: ResourceDisplayFacts,
  expectedRef: ManagedResourceRef,
) => {
  if (!refsMatch(facts.ref, expectedRef)) {
    throw unexpectedDefinitionOutput()
  }

  const fieldIds = new Set<string>()
  for (const field of facts.fields) {
    if (fieldIds.has(field.fieldId)) throw unexpectedDefinitionOutput()
    fieldIds.add(field.fieldId)
  }
  return facts
}

const isValidResourceId = (resourceId: unknown): resourceId is string =>
  typeof resourceId === "string" &&
  resourceId.length > 0 &&
  resourceId.length <= 512

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

        const createRef = (locator: TLocator): ManagedResourceRef => {
          const resourceId = definition.encodeLocator(locator)
          if (!isValidResourceId(resourceId)) throw unexpectedDefinitionOutput()
          return {
            siteType: definition.siteType,
            kind: definition.kind,
            scopeKey,
            resourceId,
          }
        }

        const decodeRef = (candidate: unknown) => {
          if (
            typeof candidate !== "object" ||
            candidate === null ||
            Array.isArray(candidate)
          ) {
            throw invalidPublicInput()
          }

          const ref = candidate as Record<string, unknown>
          const { siteType, kind, scopeKey: refScopeKey, resourceId } = ref
          if (
            typeof siteType !== "string" ||
            siteType !== definition.siteType ||
            typeof kind !== "string" ||
            kind !== definition.kind ||
            typeof refScopeKey !== "string" ||
            refScopeKey !== scopeKey ||
            !isValidResourceId(resourceId)
          ) {
            throw invalidPublicInput()
          }

          const canonicalRef: ManagedResourceRef = {
            siteType: definition.siteType,
            kind: definition.kind,
            scopeKey,
            resourceId,
          }
          return {
            ref: canonicalRef,
            locator: definition.decodeLocator(canonicalRef.resourceId),
          }
        }

        const refFromDetail = (detail: TDetail) =>
          createRef(definition.locatorFromDetail(detail))

        const assertDetailIdentity = (
          detail: TDetail,
          expectedRef: ManagedResourceRef,
        ) => {
          if (!refsMatch(refFromDetail(detail), expectedRef)) {
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
          return assertValidFacts(definition.toDetailFacts(detail, ref), ref)
        }

        const projectDetailAtRef = (
          detail: TDetail,
          expectedRef: ManagedResourceRef,
        ) => {
          assertDetailIdentity(detail, expectedRef)
          return assertValidFacts(
            definition.toDetailFacts(detail, expectedRef),
            expectedRef,
          )
        }

        const createEditor = <TCommand>(
          editorDefinition: NativeResourceEditorDefinition<TCommand>,
          mutate: (
            command: TCommand,
            options?: ResourceOperationOptions,
          ) => Promise<NativeResourceMutationResult<TDetail, TFailure>>,
          projectResult: (detail: TDetail) => ResourceDisplayFacts,
        ): ResourceEditor => {
          let closed = false
          let inflight: Promise<ResourceDisplayFacts> | undefined

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

            const run = mapOperationFailure(async () => {
              const validation = validate(values)
              if (!validation.valid) throw invalidPublicInput(validation.issues)
              const command = editorDefinition.buildCommand(values)
              let detail: TDetail
              try {
                detail = await toPublicMutation(async () => {
                  const result = await mutate(command, submitOptions)
                  if (result.certainty !== "not-applied") closed = true
                  return result
                }, mapFailure)
              } catch (error) {
                const managedError = toManagedError(error, mapFailure)
                if (
                  managedError.failure.code ===
                    MANAGED_RESOURCE_FAILURE_CODES.NotFound ||
                  managedError.failure.code ===
                    MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain
                ) {
                  closed = true
                }
                throw managedError
              }
              return projectResult(detail)
            }, mapFailure)

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
            submit,
          }
        }

        const workspace: ManagedResourceWorkspace = {
          supportsSearch: definition.supportsSearch,
          list: (query, listOptions) =>
            mapOperationFailure(async () => {
              const page = await definition.list(config, query, listOptions)
              const items = page.items.map((item) => {
                const ref = createRef(definition.locatorFromListItem(item))
                return assertValidFacts(definition.toListFacts(item, ref), ref)
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
              return assertValidFacts(
                definition.toDetailFacts(detail, canonicalRef),
                canonicalRef,
              )
            }, mapFailure),
          openCreateEditor: (editorOptions) =>
            mapOperationFailure(async () => {
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
            mapOperationFailure(async () => {
              const { ref: canonicalRef, detail } = await readDetail(
                ref,
                editorOptions,
              )
              const editorDefinition = definition.editEditor(config, detail)
              return createEditor(
                editorDefinition,
                (command, submitOptions) =>
                  definition.update(config, detail, command, submitOptions),
                (updatedDetail) =>
                  projectDetailAtRef(updatedDetail, canonicalRef),
              )
            }, mapFailure),
          delete: (ref, deleteOptions) =>
            mapOperationFailure(async () => {
              const { locator } = decodeRef(ref)
              try {
                await mapOperationFailure(
                  () =>
                    toPublicMutation(
                      () => definition.delete(config, locator, deleteOptions),
                      mapFailure,
                    ),
                  mapFailure,
                )
              } catch (error) {
                if (
                  error instanceof ManagedResourceError &&
                  error.failure.code === MANAGED_RESOURCE_FAILURE_CODES.NotFound
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
