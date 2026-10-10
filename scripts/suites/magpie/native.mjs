/** Independent native readback: this module never imports the production adapter. */
export async function createMagpieNativeClient(request, config) {
  const root = config.baseUrl.replace(/\/+$/, "")
  const login = await request
    .get(`${root}/`, {
      params: { k: config.webKey },
      timeout: 30_000,
    })
    .catch(() => {
      throw new Error(
        "Magpie authentication request failed (secret URL omitted)",
      )
    })
  if (!login.ok())
    throw new Error(`Magpie authentication returned HTTP ${login.status()}`)
  const call = async (path, body) => {
    const response =
      body === undefined
        ? await request.get(`${root}${path}`, { timeout: 30_000 })
        : await request.post(`${root}${path}`, { data: body, timeout: 30_000 })
    if (!response.ok())
      throw new Error(`Magpie ${path} returned HTTP ${response.status()}`)
    return response.json()
  }
  return {
    async inventory() {
      const value = await call("/api/providers")
      if (!Array.isArray(value.providers))
        throw new Error("Invalid Magpie inventory")
      return value.providers
    },
    save: (payload) => call("/api/provider/save", payload),
    remove: (id) => call("/api/provider/delete", { id }),
    key: async (id) => (await call("/api/provider/key", { id })).key,
    keyAction: (action, payload) => call(`/api/keys/${action}`, payload),
  }
}

/** Recover this run's uncertain creates without touching earlier or concurrent resources. */
export async function createMagpieRunResources(native) {
  const baseline = new Set((await native.inventory()).map((item) => item.id))
  const ids = new Set()
  const names = new Set()
  const owned = (item) =>
    !baseline.has(item.id) && (ids.has(item.id) || names.has(item.name))
  return {
    ids,
    names,
    async cleanup() {
      const errors = []
      for (const item of (await native.inventory()).filter(owned)) {
        try {
          await native.remove(item.id)
        } catch (error) {
          errors.push(error)
        }
      }
      const remaining = await native.inventory()
      if (remaining.some(owned))
        errors.push(new Error("Run-owned Magpie providers remain"))
      if (errors.length)
        throw new AggregateError(errors, "Magpie resource cleanup failed")
    },
  }
}
