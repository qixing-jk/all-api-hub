/** Lazily loads the account-list drag-and-drop runtime. */
export function loadAccountListDndRuntime() {
  return import(
    "~/features/AccountManagement/components/AccountList/ordering/AccountListDndRuntime"
  )
}
