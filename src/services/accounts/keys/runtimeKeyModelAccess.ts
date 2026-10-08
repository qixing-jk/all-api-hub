/** Model-use policy projected by the credential owner, independent of key CRUD. */
export interface AccountRuntimeKeyModelAccess {
  /** Null means that model groups do not constrain this credential. */
  groups: readonly string[] | null
  /** Null is unrestricted; an empty list explicitly allows no models. */
  allowedModelIds: readonly string[] | null
  /** Provider hints for model selection, independent of enforced restrictions. */
  suggestedModelIds: readonly string[]
}

export const UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS: AccountRuntimeKeyModelAccess =
  Object.freeze({ groups: null, allowedModelIds: null, suggestedModelIds: [] })
