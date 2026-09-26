import { lazy, type ComponentType } from "react"

/** Wrap a lazy route loader so navigation and React share its in-flight request. */
export function createLazyMenuComponent(
  loader: () => Promise<{ default: ComponentType<any> }>,
): ComponentType<any> & { preload: typeof loader } {
  let loading: ReturnType<typeof loader> | undefined
  const preload = () => {
    if (!loading) {
      loading = loader().catch((error: unknown) => {
        loading = undefined
        throw error
      })
    }
    return loading
  }
  return Object.assign(lazy(preload), { preload })
}
