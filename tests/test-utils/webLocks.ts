import { vi } from "vitest"

/** Node shares Web Locks across Vitest threads; browser fixtures have separate origins. */
export function isolateWebLocks() {
  const request = navigator.locks.request.bind(navigator.locks)
  const scope = crypto.randomUUID()
  vi.spyOn(navigator.locks, "request").mockImplementation(((
    name: string,
    ...args: unknown[]
  ) =>
    Reflect.apply(request, navigator.locks, [
      `${scope}:${name}`,
      ...args,
    ])) as typeof navigator.locks.request)
}
