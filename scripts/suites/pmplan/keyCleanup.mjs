import assert from "node:assert/strict"

/** Revoke only IDs confirmed by this run, with independent readback for each ID. */
export async function revokePmplanKeys({
  site,
  ids,
  readKeys,
  timeoutMs = 15000,
}) {
  const errors = []
  for (const id of ids) {
    try {
      const key = (await readKeys()).find((key) => key.id === id)
      if (!key || key.status === "revoked") continue
      let mutationError
      try {
        await site.evaluate(
          async ({ id, timeoutMs }) => {
            const response = await fetch(`/api/keys/${id}`, {
              method: "DELETE",
              credentials: "include",
              headers: { "X-PMPlan-CSRF": "1" },
              signal: AbortSignal.timeout(timeoutMs),
            })
            if (!response.ok)
              throw Error(`Owned key cleanup: ${response.status}`)
          },
          { id, timeoutMs },
        )
      } catch (error) {
        mutationError = error
      }
      const confirmed = (await readKeys()).find((key) => key.id === id)
      if (confirmed && confirmed.status !== "revoked") {
        if (mutationError) throw mutationError
        assert.fail(`Owned key ${id} revocation was not confirmed`)
      }
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length)
    throw new AggregateError(errors, "Disposable key cleanup failed")
}
