import assert from "node:assert/strict"

/** Preserve independent revocation and baseline diagnostics before persisting the suite report. */
export async function finalizePmplanKeys({
  site,
  ids,
  baseline,
  readKeys,
  report,
}) {
  const errors = []
  try {
    for (const id of ids) assert.ok(!baseline.some((key) => key.id === id))
    await revokePmplanKeys({ site, ids, readKeys })
  } catch (error) {
    errors.push(error)
  }
  let existingKeysUnchanged = false
  try {
    if (baseline.length) {
      const final = await readKeys()
      for (const key of baseline)
        assert.deepEqual(
          final.find((item) => item.id === key.id),
          key,
          "Existing key changed",
        )
    }
    existingKeysUnchanged = true
  } catch (error) {
    errors.push(error)
  }
  report.cleanup = {
    ownedIds: [...ids],
    existingKeysUnchanged,
    errors: errors.map((error) => error.message),
  }
  if (errors.length)
    throw new AggregateError(errors, "Disposable key cleanup failed")
}

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
      if (mutationError && confirmed?.status !== "revoked") throw mutationError
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
