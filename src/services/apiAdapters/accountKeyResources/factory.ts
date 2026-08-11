import type { AccountSiteType } from "~/constants/siteType"
import type {
  AccountKeyEditorSubmitResult,
  AccountKeyProvisionedResource,
  AccountKeyProvisioningSnapshot,
  AccountKeyResourceCapability,
  AccountKeyResourceCollection,
  AccountKeyResourceEditor,
  AccountKeyResourceFacts,
  AccountKeyResourceOpenInput,
  AccountKeyResourceRef,
  AccountKeyScope,
  AccountKeyScopeInventory,
  AccountRuntimeKeyResolution,
  EditableResourceProjection,
  ResourceFailure,
  ResourceFieldIssue,
  ResourceListQuery,
  ResourceOperationOptions,
  ResourceValidationResult,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  ACCOUNT_KEY_RESOURCE_FIELD_ISSUE_CODES,
  AccountKeyResourceError,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  assertNativeResourceFacts,
  createNativeEditorSubmitGate,
  createNativeResourceRefBoundary,
  isNativeResourceBoundaryError,
  resolveNativeResourceMutation,
  type NativeResourceMutationResult,
} from "~/services/apiAdapters/nativeResources/factory"

import { isAccountKeyResourceRef, isAccountKeyResourceRefFor } from "./ref"

export type AccountKeyResourcePage<TItem> = {
  items: readonly TItem[]
  total?: number
  nextCursor?: string
}

export type AccountKeyResourceEditorDefinition<TCommand> = {
  fields: AccountKeyResourceEditor["fields"]
  initialValues: EditableResourceProjection
  validate(values: EditableResourceProjection): ResourceValidationResult
  buildCommand(values: EditableResourceProjection): TCommand
  destinationScopeKey?: (command: TCommand) => string
  loadOptions?: AccountKeyResourceEditor["loadOptions"]
}

export type AccountKeyCreateMutation<TDetail> = {
  detail: TDetail
  scopeKey?: string
  createdSecret?: AccountKeyEditorSubmitResult["createdSecret"]
}

export type AccountKeyResourceDefinition<
  TConfig,
  TLocator,
  TListItem,
  TDetail,
  TCreateCommand,
  TUpdateCommand,
  TFailure,
> = {
  siteType: AccountSiteType
  openConfig(
    input: AccountKeyResourceOpenInput,
    options?: ResourceOperationOptions,
  ): Promise<TConfig>
  listScopes(
    config: TConfig,
    options?: ResourceOperationOptions,
  ): Promise<readonly AccountKeyScope[]>
  listScopeInventory?(
    config: TConfig,
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyScopeInventory>
  provisioning?: {
    inspect(
      config: TConfig,
      options?: ResourceOperationOptions,
    ): Promise<AccountKeyProvisioningSnapshot>
    provision(
      config: TConfig,
      requirementKey: string,
      options?: ResourceOperationOptions,
    ): Promise<
      NativeResourceMutationResult<AccountKeyProvisionedResource, TFailure>
    >
    rename?(
      config: TConfig,
      ref: AccountKeyResourceRef,
      options?: ResourceOperationOptions,
    ): Promise<NativeResourceMutationResult<void, TFailure>>
  }
  runtimeKey?: {
    resolve(
      config: TConfig,
      ref: AccountKeyResourceRef,
      options?: ResourceOperationOptions,
    ): Promise<AccountRuntimeKeyResolution>
  }
  defaultScopeKey(config: TConfig, scopes: readonly AccountKeyScope[]): string
  encodeLocator(locator: TLocator): string
  decodeLocator(resourceId: string): TLocator
  locatorFromListItem(item: TListItem): TLocator
  locatorFromDetail(detail: TDetail): TLocator
  list(
    config: TConfig,
    scope: AccountKeyScope,
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyResourcePage<TListItem>>
  get(
    config: TConfig,
    scope: AccountKeyScope,
    locator: TLocator,
    options?: ResourceOperationOptions,
  ): Promise<TDetail>
  toListFacts(
    item: TListItem,
    ref: AccountKeyResourceRef,
  ): AccountKeyResourceFacts
  toDetailFacts(
    detail: TDetail,
    ref: AccountKeyResourceRef,
  ): AccountKeyResourceFacts
  createEditor(
    config: TConfig,
    scope: AccountKeyScope,
    options?: ResourceOperationOptions,
    scopeInventory?: AccountKeyScopeInventory,
  ): Promise<AccountKeyResourceEditorDefinition<TCreateCommand>>
  editEditor(
    config: TConfig,
    scope: AccountKeyScope,
    detail: TDetail,
  ): AccountKeyResourceEditorDefinition<TUpdateCommand>
  create(
    config: TConfig,
    scope: AccountKeyScope,
    command: TCreateCommand,
    options?: ResourceOperationOptions,
  ): Promise<
    NativeResourceMutationResult<AccountKeyCreateMutation<TDetail>, TFailure>
  >
  update(
    config: TConfig,
    scope: AccountKeyScope,
    detail: TDetail,
    command: TUpdateCommand,
    options?: ResourceOperationOptions,
  ): Promise<NativeResourceMutationResult<TDetail, TFailure>>
  delete(
    config: TConfig,
    scope: AccountKeyScope,
    locator: TLocator,
    options?: ResourceOperationOptions,
  ): Promise<NativeResourceMutationResult<void, TFailure>>
  mapFailure(error: unknown): ResourceFailure
}

const validationFailure = (fieldIssues?: readonly ResourceFieldIssue[]) =>
  new AccountKeyResourceError({
    code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed,
    ...(fieldIssues === undefined ? {} : { fieldIssues }),
  })

const unexpectedFailure = () =>
  new AccountKeyResourceError({
    code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
  })

const toAccountKeyResourceError = (
  error: unknown,
  mapFailure: (error: unknown) => ResourceFailure,
) => {
  if (error instanceof AccountKeyResourceError) return error
  try {
    return new AccountKeyResourceError(mapFailure(error))
  } catch {
    return unexpectedFailure()
  }
}

const mapOperation = async <T>(
  operation: () => Promise<T>,
  mapFailure: (error: unknown) => ResourceFailure,
): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    throw toAccountKeyResourceError(error, mapFailure)
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isBoundedNonBlankString = (
  value: unknown,
  maximum: number,
): value is string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= maximum

const normalizeScope = (value: unknown): AccountKeyScope => {
  if (!isRecord(value)) throw unexpectedFailure()

  const { scopeKey, routeKey, displayName, isDefault, secondaryLabel } = value
  if (
    !isBoundedNonBlankString(scopeKey, 2048) ||
    !isBoundedNonBlankString(routeKey, 512) ||
    !isBoundedNonBlankString(displayName, 512) ||
    typeof isDefault !== "boolean" ||
    (secondaryLabel !== undefined &&
      !isBoundedNonBlankString(secondaryLabel, 512))
  ) {
    throw unexpectedFailure()
  }

  return Object.freeze({
    scopeKey,
    routeKey,
    displayName,
    isDefault,
    ...(secondaryLabel === undefined ? {} : { secondaryLabel }),
  })
}

const normalizeScopes = (value: unknown): readonly AccountKeyScope[] => {
  if (!Array.isArray(value) || value.length === 0) throw unexpectedFailure()

  const scopes = value.map(normalizeScope)
  const scopeKeys = new Set<string>()
  const routeKeys = new Set<string>()
  for (const scope of scopes) {
    if (scopeKeys.has(scope.scopeKey) || routeKeys.has(scope.routeKey)) {
      throw unexpectedFailure()
    }
    scopeKeys.add(scope.scopeKey)
    routeKeys.add(scope.routeKey)
  }
  return Object.freeze(scopes)
}

const cloneScope = (scope: AccountKeyScope): AccountKeyScope =>
  Object.freeze({
    scopeKey: scope.scopeKey,
    routeKey: scope.routeKey,
    displayName: scope.displayName,
    isDefault: scope.isDefault,
    ...(scope.secondaryLabel === undefined
      ? {}
      : { secondaryLabel: scope.secondaryLabel }),
  })

const FAILURE_CODES = new Set<string>(
  Object.values(ACCOUNT_KEY_RESOURCE_FAILURE_CODES),
)

const normalizeScopeInventory = (
  value: AccountKeyScopeInventory,
): AccountKeyScopeInventory => {
  if (!isRecord(value)) throw unexpectedFailure()
  const scopes = normalizeScopes(value.scopes)
  const partialFailure = value.partialFailure
  if (partialFailure === undefined) return Object.freeze({ scopes })
  if (
    !isRecord(partialFailure) ||
    typeof partialFailure.code !== "string" ||
    !FAILURE_CODES.has(partialFailure.code) ||
    (partialFailure.message !== undefined &&
      !isBoundedNonBlankString(partialFailure.message, 8192)) ||
    (partialFailure.upstreamCode !== undefined &&
      !isBoundedNonBlankString(partialFailure.upstreamCode, 512))
  ) {
    throw unexpectedFailure()
  }
  return Object.freeze({
    scopes,
    partialFailure: Object.freeze({
      code: partialFailure.code as ResourceFailure["code"],
      ...(partialFailure.message === undefined
        ? {}
        : { message: partialFailure.message }),
      ...(partialFailure.upstreamCode === undefined
        ? {}
        : { upstreamCode: partialFailure.upstreamCode }),
    }),
  })
}

const FIELD_ISSUE_CODES = new Set<string>(
  Object.values(ACCOUNT_KEY_RESOURCE_FIELD_ISSUE_CODES),
)

const normalizeValidationResult = (
  value: unknown,
): ResourceValidationResult => {
  if (!isRecord(value)) throw unexpectedFailure()
  if (value.valid === true) return { valid: true }
  if (value.valid !== false || !Array.isArray(value.issues)) {
    throw unexpectedFailure()
  }

  const issues = value.issues.map((issue): ResourceFieldIssue => {
    if (
      !isRecord(issue) ||
      !isBoundedNonBlankString(issue.fieldId, 512) ||
      typeof issue.code !== "string" ||
      !FIELD_ISSUE_CODES.has(issue.code)
    ) {
      throw unexpectedFailure()
    }
    return Object.freeze({
      fieldId: issue.fieldId,
      code: issue.code as ResourceFieldIssue["code"],
    })
  })
  return { valid: false, issues: Object.freeze(issues) }
}

/** Rejects malformed public open input before any provider capability runs. */
function assertOpenInput(
  input: unknown,
  siteType: AccountSiteType,
): asserts input is AccountKeyResourceOpenInput {
  if (
    !isRecord(input) ||
    !isRecord(input.account) ||
    !isRecord(input.request) ||
    !isBoundedNonBlankString(input.account.id, 512) ||
    input.account.siteType !== siteType ||
    (input.account.name !== undefined &&
      !isBoundedNonBlankString(input.account.name, 512)) ||
    input.request.accountId !== input.account.id ||
    !isBoundedNonBlankString(input.request.baseUrl, 8192) ||
    !isRecord(input.request.auth)
  ) {
    throw validationFailure()
  }
}

/** Composes neutral boundaries into an account-correlated native key capability. */
export function defineAccountKeyResourceCapability<
  TConfig,
  TLocator,
  TListItem,
  TDetail,
  TCreateCommand,
  TUpdateCommand,
  TFailure,
>(
  definition: AccountKeyResourceDefinition<
    TConfig,
    TLocator,
    TListItem,
    TDetail,
    TCreateCommand,
    TUpdateCommand,
    TFailure
  >,
): AccountKeyResourceCapability {
  const mapFailure = (error: unknown) => definition.mapFailure(error)
  const siteType = definition.siteType

  return {
    open: (input, options) =>
      mapOperation(async () => {
        assertOpenInput(input, siteType)
        const accountId = input.account.id
        const config = await definition.openConfig(input, options)
        const provisioningDefinition = definition.provisioning
        const runtimeKeyDefinition = definition.runtimeKey
        const isSessionRef = (value: unknown): value is AccountKeyResourceRef =>
          isAccountKeyResourceRef(value) &&
          value.accountId === accountId &&
          value.siteType === siteType
        const assertProvisionedResource = (
          value: AccountKeyProvisionedResource,
        ): AccountKeyProvisionedResource => {
          if (!isSessionRef(value.ref)) throw unexpectedFailure()
          const createdSecret = value.createdSecret
          if (
            createdSecret &&
            (createdSecret.correlation.kind !== "account-key-resource" ||
              !isSessionRef(createdSecret.correlation.ref) ||
              createdSecret.correlation.ref.scopeKey !== value.ref.scopeKey ||
              createdSecret.correlation.ref.resourceId !== value.ref.resourceId)
          ) {
            throw unexpectedFailure()
          }
          return value
        }
        let cachedScopeInventory: AccountKeyScopeInventory | undefined
        let sharedScopeLoad: Promise<AccountKeyScopeInventory> | undefined
        const loadScopeInventory = (
          scopeOptions?: ResourceOperationOptions,
          replaceCached = false,
        ) =>
          mapOperation(async () => {
            const normalized = normalizeScopeInventory(
              definition.listScopeInventory
                ? await definition.listScopeInventory(config, scopeOptions)
                : {
                    scopes: await definition.listScopes(config, scopeOptions),
                  },
            )
            if (replaceCached || !cachedScopeInventory) {
              cachedScopeInventory = normalized
            }
            return cachedScopeInventory
          }, mapFailure)
        const getScopeInventory = (scopeOptions?: ResourceOperationOptions) => {
          if (cachedScopeInventory) return Promise.resolve(cachedScopeInventory)
          if (scopeOptions?.signal) return loadScopeInventory(scopeOptions)
          if (!sharedScopeLoad) {
            const run = loadScopeInventory(scopeOptions)
            const tracked = run.finally(() => {
              if (sharedScopeLoad === tracked) sharedScopeLoad = undefined
            })
            sharedScopeLoad = tracked
          }
          return sharedScopeLoad
        }
        const getScopes = async (scopeOptions?: ResourceOperationOptions) =>
          (await getScopeInventory(scopeOptions)).scopes
        const resolveScope = async (
          scopeKey: string | undefined,
          scopeOptions?: ResourceOperationOptions,
        ) => {
          const scopes = await getScopes(scopeOptions)
          let desiredScopeKey: string
          try {
            desiredScopeKey =
              scopeKey ?? definition.defaultScopeKey(config, scopes)
          } catch (error) {
            throw toAccountKeyResourceError(error, mapFailure)
          }
          if (!isBoundedNonBlankString(desiredScopeKey, 2048)) {
            throw validationFailure()
          }
          const scope = scopes.find((item) => item.scopeKey === desiredScopeKey)
          if (!scope) throw validationFailure()
          return scope
        }
        const createEditor = <TCommand, TMutationValue>(options: {
          editorDefinition: AccountKeyResourceEditorDefinition<TCommand>
          resolveDestinationScopeKey(values: EditableResourceProjection): string
          mutate(
            command: TCommand,
            submitOptions?: ResourceOperationOptions,
          ): Promise<NativeResourceMutationResult<TMutationValue, TFailure>>
          projectApplied(value: TMutationValue): AccountKeyEditorSubmitResult
        }): AccountKeyResourceEditor => {
          const { editorDefinition } = options
          const validate = (values: EditableResourceProjection) => {
            try {
              return normalizeValidationResult(
                editorDefinition.validate(values),
              )
            } catch (error) {
              throw toAccountKeyResourceError(error, mapFailure)
            }
          }
          const gate = createNativeEditorSubmitGate({
            validate: (values: EditableResourceProjection) => {
              const result = validate(values)
              if (!result.valid) throw validationFailure(result.issues)
            },
            buildCommand: editorDefinition.buildCommand,
            mutate: options.mutate,
            resolve: (result) => {
              const resolution = resolveNativeResourceMutation(result)
              if (resolution.status === "applied") {
                return options.projectApplied(resolution.value)
              }
              if (resolution.status === "not-applied") {
                throw new AccountKeyResourceError(
                  mapFailure(resolution.failure),
                )
              }
              const failure = mapFailure(resolution.failure)
              throw new AccountKeyResourceError({
                code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
                ...(failure.message ? { message: failure.message } : {}),
                ...(failure.upstreamCode
                  ? { upstreamCode: failure.upstreamCode }
                  : {}),
              })
            },
            normalizeError: (error) =>
              isNativeResourceBoundaryError(error)
                ? unexpectedFailure()
                : toAccountKeyResourceError(error, mapFailure),
            shouldCloseAfterError: (error) => {
              const accountError = toAccountKeyResourceError(error, mapFailure)
              return (
                accountError.failure.code ===
                  ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound ||
                accountError.failure.code ===
                  ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain
              )
            },
            closedError: validationFailure,
          })
          return {
            fields: editorDefinition.fields,
            initialValues: editorDefinition.initialValues,
            validate,
            resolveDestinationScopeKey: (values) => {
              try {
                return options.resolveDestinationScopeKey(values)
              } catch (error) {
                throw toAccountKeyResourceError(error, mapFailure)
              }
            },
            ...(editorDefinition.loadOptions
              ? {
                  loadOptions: (fieldId, values, loadOptions) =>
                    mapOperation(
                      () =>
                        editorDefinition.loadOptions!(
                          fieldId,
                          values,
                          loadOptions,
                        ),
                      mapFailure,
                    ),
                }
              : {}),
            submit: (values, submitOptions) =>
              gate.submit(values, submitOptions),
          }
        }

        const openCollection = async (
          scopeKey: string,
          collectionOptions?: ResourceOperationOptions,
        ): Promise<AccountKeyResourceCollection> => {
          const resolvedScope = await resolveScope(scopeKey, collectionOptions)
          const canonicalScopeKey = resolvedScope.scopeKey
          const canonicalRouteKey = resolvedScope.routeKey
          const providerScope = cloneScope({
            ...resolvedScope,
            scopeKey: canonicalScopeKey,
            routeKey: canonicalRouteKey,
          })
          const publicScope = cloneScope({
            ...resolvedScope,
            scopeKey: canonicalScopeKey,
            routeKey: canonicalRouteKey,
          })
          const refBoundary = createNativeResourceRefBoundary<
            AccountKeyResourceRef,
            TLocator
          >({
            scopeKey: canonicalScopeKey,
            encodeLocator: definition.encodeLocator,
            decodeLocator: definition.decodeLocator,
            buildRef: (resourceId) =>
              Object.freeze({
                accountId,
                siteType,
                scopeKey: canonicalScopeKey,
                resourceId,
              }),
            matchesRef: (value): value is AccountKeyResourceRef =>
              isAccountKeyResourceRefFor(value, {
                accountId,
                siteType,
                scopeKey: canonicalScopeKey,
              }),
          })
          const createRef = (locator: TLocator) => {
            try {
              return refBoundary.createRef(locator)
            } catch (error) {
              if (isNativeResourceBoundaryError(error))
                throw unexpectedFailure()
              throw error
            }
          }
          const decodeRef = (ref: unknown) => {
            try {
              return refBoundary.decodeRef(ref)
            } catch (error) {
              if (isNativeResourceBoundaryError(error))
                throw validationFailure()
              throw error
            }
          }
          const projectFacts = (
            facts: AccountKeyResourceFacts,
            ref: AccountKeyResourceRef,
          ) => {
            try {
              return assertNativeResourceFacts(
                facts,
                ref,
                refBoundary.refsMatch,
              )
            } catch (error) {
              if (isNativeResourceBoundaryError(error))
                throw unexpectedFailure()
              throw error
            }
          }
          const readDetail = async (
            ref: unknown,
            readOptions?: ResourceOperationOptions,
          ) => {
            const decoded = decodeRef(ref)
            const detail = await definition.get(
              config,
              providerScope,
              decoded.locator,
              readOptions,
            )
            const actualRef = createRef(definition.locatorFromDetail(detail))
            if (!refBoundary.refsMatch(actualRef, decoded.ref)) {
              throw unexpectedFailure()
            }
            return { detail, ref: decoded.ref }
          }
          return {
            scope: publicScope,
            list: (query, listOptions) =>
              mapOperation(async () => {
                const page = await definition.list(
                  config,
                  providerScope,
                  query,
                  listOptions,
                )
                return {
                  items: page.items.map((item) => {
                    const ref = createRef(definition.locatorFromListItem(item))
                    return projectFacts(definition.toListFacts(item, ref), ref)
                  }),
                  ...(page.total === undefined ? {} : { total: page.total }),
                  ...(page.nextCursor === undefined
                    ? {}
                    : { nextCursor: page.nextCursor }),
                }
              }, mapFailure),
            get: (ref, getOptions) =>
              mapOperation(async () => {
                const current = await readDetail(ref, getOptions)
                return projectFacts(
                  definition.toDetailFacts(current.detail, current.ref),
                  current.ref,
                )
              }, mapFailure),
            openEditEditor: (ref, editorOptions) =>
              mapOperation(async () => {
                const current = await readDetail(ref, editorOptions)
                const editorDefinition = definition.editEditor(
                  config,
                  providerScope,
                  current.detail,
                )
                return createEditor({
                  editorDefinition,
                  resolveDestinationScopeKey: () => canonicalScopeKey,
                  mutate: async (command, submitOptions) => {
                    const latest = await readDetail(current.ref, submitOptions)
                    return definition.update(
                      config,
                      providerScope,
                      latest.detail,
                      command,
                      submitOptions,
                    )
                  },
                  projectApplied: (detail) => {
                    const returnedRef = createRef(
                      definition.locatorFromDetail(detail),
                    )
                    if (!refBoundary.refsMatch(returnedRef, current.ref)) {
                      throw unexpectedFailure()
                    }
                    return {
                      facts: projectFacts(
                        definition.toDetailFacts(detail, returnedRef),
                        returnedRef,
                      ),
                    }
                  },
                })
              }, mapFailure),
            delete: (ref, deleteOptions) =>
              mapOperation(async () => {
                const { locator } = decodeRef(ref)
                const resolution = resolveNativeResourceMutation(
                  await definition.delete(
                    config,
                    providerScope,
                    locator,
                    deleteOptions,
                  ),
                )
                if (resolution.status === "not-applied") {
                  throw new AccountKeyResourceError(
                    mapFailure(resolution.failure),
                  )
                }
                if (resolution.status === "uncertain") {
                  const failure = mapFailure(resolution.failure)
                  throw new AccountKeyResourceError({
                    code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
                    ...(failure.message ? { message: failure.message } : {}),
                    ...(failure.upstreamCode
                      ? { upstreamCode: failure.upstreamCode }
                      : {}),
                  })
                }
              }, mapFailure),
          }
        }

        return {
          ...(provisioningDefinition
            ? {
                provisioning: {
                  inspect: (provisioningOptions?: ResourceOperationOptions) =>
                    mapOperation(
                      () =>
                        provisioningDefinition.inspect(
                          config,
                          provisioningOptions,
                        ),
                      mapFailure,
                    ),
                  provision: (
                    requirementKey: string,
                    provisioningOptions?: ResourceOperationOptions,
                  ) =>
                    mapOperation(async () => {
                      const result = await provisioningDefinition.provision(
                        config,
                        requirementKey,
                        provisioningOptions,
                      )
                      if (result.certainty === "applied") {
                        return {
                          certainty: result.certainty,
                          value: assertProvisionedResource(result.value),
                        }
                      }
                      return {
                        certainty: result.certainty,
                        failure: mapFailure(result.failure),
                      }
                    }, mapFailure),
                  ...(provisioningDefinition.rename
                    ? {
                        rename: (
                          ref: AccountKeyResourceRef,
                          renameOptions?: ResourceOperationOptions,
                        ) =>
                          mapOperation(async () => {
                            if (!isSessionRef(ref)) throw validationFailure()
                            const result = await provisioningDefinition.rename!(
                              config,
                              ref,
                              renameOptions,
                            )
                            return result.certainty === "applied"
                              ? result
                              : {
                                  certainty: result.certainty,
                                  failure: mapFailure(result.failure),
                                }
                          }, mapFailure),
                      }
                    : {}),
                },
              }
            : {}),
          ...(runtimeKeyDefinition
            ? {
                runtimeKey: {
                  resolve: (
                    ref: AccountKeyResourceRef,
                    runtimeKeyOptions?: ResourceOperationOptions,
                  ) =>
                    mapOperation(async () => {
                      if (!isSessionRef(ref)) throw validationFailure()
                      await resolveScope(ref.scopeKey, runtimeKeyOptions)
                      return runtimeKeyDefinition.resolve(
                        config,
                        ref,
                        runtimeKeyOptions,
                      )
                    }, mapFailure),
                },
              }
            : {}),
          resolveDefaultScope: (scopeOptions) =>
            resolveScope(undefined, scopeOptions),
          listScopes: getScopes,
          listScopeInventory: getScopeInventory,
          refreshScopeInventory: (scopeOptions) =>
            loadScopeInventory(scopeOptions, true),
          openCollection,
          openCreateEditor: async (scopeKey: string, editorOptions) => {
            const resolvedScope = await resolveScope(scopeKey, editorOptions)
            const editorScopeInventory = cachedScopeInventory
            if (!editorScopeInventory) throw unexpectedFailure()
            const canonicalScopeKey = resolvedScope.scopeKey
            const canonicalRouteKey = resolvedScope.routeKey
            const providerScope = cloneScope({
              ...resolvedScope,
              scopeKey: canonicalScopeKey,
              routeKey: canonicalRouteKey,
            })
            const editorDefinition = await mapOperation(
              () =>
                definition.createEditor(
                  config,
                  providerScope,
                  editorOptions,
                  editorScopeInventory,
                ),
              mapFailure,
            )
            const resolveCreateDestinationScopeKey = (
              command: TCreateCommand,
            ) => {
              const destinationScopeKey =
                editorDefinition.destinationScopeKey?.(command) ??
                canonicalScopeKey
              if (
                !isBoundedNonBlankString(destinationScopeKey, 2048) ||
                !editorScopeInventory.scopes.some(
                  (scope) => scope.scopeKey === destinationScopeKey,
                )
              ) {
                throw validationFailure()
              }
              return destinationScopeKey
            }
            return createEditor({
              editorDefinition,
              resolveDestinationScopeKey: (values) => {
                return resolveCreateDestinationScopeKey(
                  editorDefinition.buildCommand(values),
                )
              },
              mutate: (command, submitOptions) => {
                resolveCreateDestinationScopeKey(command)
                return definition.create(
                  config,
                  providerScope,
                  command,
                  submitOptions,
                )
              },
              projectApplied: (result) => {
                const appliedScopeKey = result.scopeKey ?? canonicalScopeKey
                if (!isBoundedNonBlankString(appliedScopeKey, 2048))
                  throw unexpectedFailure()
                const refBoundary = createNativeResourceRefBoundary<
                  AccountKeyResourceRef,
                  TLocator
                >({
                  scopeKey: appliedScopeKey,
                  encodeLocator: definition.encodeLocator,
                  decodeLocator: definition.decodeLocator,
                  buildRef: (resourceId) =>
                    Object.freeze({
                      accountId,
                      siteType,
                      scopeKey: appliedScopeKey,
                      resourceId,
                    }),
                  matchesRef: (value): value is AccountKeyResourceRef =>
                    isAccountKeyResourceRefFor(value, {
                      accountId,
                      siteType,
                      scopeKey: appliedScopeKey,
                    }),
                })
                const ref = refBoundary.createRef(
                  definition.locatorFromDetail(result.detail),
                )
                const facts = assertNativeResourceFacts(
                  definition.toDetailFacts(result.detail, ref),
                  ref,
                  refBoundary.refsMatch,
                )
                const createdSecret = result.createdSecret
                if (
                  createdSecret &&
                  (createdSecret.correlation.kind !== "account-key-resource" ||
                    !refBoundary.refsMatch(createdSecret.correlation.ref, ref))
                ) {
                  throw unexpectedFailure()
                }
                return { facts, ...(createdSecret ? { createdSecret } : {}) }
              },
            })
          },
        }
      }, mapFailure),
  }
}
