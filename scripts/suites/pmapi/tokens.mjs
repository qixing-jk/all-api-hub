/** Read the complete console inventory for baseline, readback and cleanup. */
export async function readAllPmApiTokens(read) {
  const size = 100
  const first = await read(`/api/tokens?p=1&size=${size}`)
  const items = [...first.items]
  for (let page = 2; page <= Math.ceil(first.total / size); page++) {
    const next = await read(`/api/tokens?p=${page}&size=${size}`)
    items.push(...next.items)
  }
  return items
}
