import type { AutoCheckinMutationLifecycle } from "~/services/checkin/autoCheckin/providers/contracts"

/** Creates mutable transport evidence for provider execution tests. */
export function createAutoCheckinMutationLifecycle(): AutoCheckinMutationLifecycle {
  const lifecycle: AutoCheckinMutationLifecycle = {
    dispatched: false,
    responseReceived: false,
    onDispatch() {
      lifecycle.dispatched = true
    },
    onResponse() {
      lifecycle.responseReceived = true
    },
  }

  return lifecycle
}
