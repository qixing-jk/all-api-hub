/** Lazily loads the account-list drag-and-drop runtime. */
export function loadAccountListDndRuntime() {
  return import("./AccountListDndRuntime")
}
