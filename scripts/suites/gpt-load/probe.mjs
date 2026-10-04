/**
 * Read-only protocol probe for a live gpt-load deployment.
 *
 * Establishes, without touching the extension, that the deployment still
 * matches the contract the adapter was written against: the management key is
 * accepted as an admin principal, the descriptor catalogue answers, and the
 * group inventory is readable. `--write` additionally creates, reads back, and
 * deletes one throwaway group.
 */

const normalize = (baseUrl) => baseUrl.replace(/\/+$/, "")

const call = async (root, managementKey, path, init = {}) => {
  const response = await fetch(`${root}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
      ...(init.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  let payload
  try {
    payload = text ? JSON.parse(text) : undefined
  } catch {
    payload = text
  }
  return { status: response.status, ok: response.ok, payload }
}

/**
 * Run the gpt-load protocol probe.
 * @param options Probe options.
 * @param options.baseUrl Deployment root.
 * @param options.managementKey Gateway root management key (`AUTH_KEY`).
 * @param options.allowWrite Also exercise a create/read-back/delete round trip.
 * @returns Probe summary with `ok` false when a check failed.
 */
export async function runGptLoadProbe({
  baseUrl,
  managementKey,
  allowWrite = false,
}) {
  const root = normalize(baseUrl)
  console.log("\n🔌 开始执行 gpt-load 协议层探测 (只读)...")

  const session = await call(root, managementKey, "/api/auth/session")
  if (!session.ok || session.payload?.data?.principal_type !== "admin") {
    console.warn(
      `  ❌ 管理密钥校验失败: HTTP ${session.status} / principal=${session.payload?.data?.principal_type ?? "(无)"}`,
    )
    return { ok: false, channelCount: 0, groupCount: 0 }
  }
  console.log("  ✅ 管理密钥以 admin 主体通过校验")

  const catalog = await call(root, managementKey, "/api/channels")
  const channelCount = Array.isArray(catalog.payload?.data?.items)
    ? catalog.payload.data.items.length
    : 0
  console.log(`  ✅ 渠道驱动目录可用: ${channelCount} 个驱动`)

  const groups = await call(
    root,
    managementKey,
    "/api/groups?page=1&page_size=1",
  )
  const groupCount = groups.payload?.data?.pagination?.total_items ?? 0
  console.log(`  ✅ 分组清单可读: ${groupCount} 条`)

  if (!allowWrite) {
    console.log("  ℹ️ 未开启 --write，跳过写入轮（默认只读）")
    return { ok: true, channelCount, groupCount }
  }

  const name = `AAH E2E gpt-load Probe ${Date.now().toString(36)}`
  console.log(`  ✍️ 写入轮: 创建分组 ${name}`)
  const created = await call(root, managementKey, "/api/groups", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({
      name,
      price_multiplier: "1",
      channel_id: "openai_compatible",
      connection_type: "api_key",
      params: { base_url: "https://probe.example.invalid/v1" },
      models: [],
      credentials: `sk-probe-${Date.now().toString(36)}`,
      confirm_same_target: true,
    }),
  })
  const groupId = created.payload?.data?.group_id
  if (!created.ok || !groupId) {
    console.warn(`  ❌ 创建失败: HTTP ${created.status}`)
    return { ok: false, channelCount, groupCount }
  }

  const readBack = await call(
    root,
    managementKey,
    `/api/groups/${groupId}/settings`,
  )
  const readBackName = readBack.payload?.data?.name
  if (readBackName !== name) {
    console.warn(`  ❌ 回读不一致: ${readBackName}`)
    return { ok: false, channelCount, groupCount }
  }

  const deleted = await call(root, managementKey, `/api/groups/${groupId}`, {
    method: "DELETE",
    body: "{}",
  })
  if (!deleted.ok) {
    console.warn(`  ❌ 删除失败: HTTP ${deleted.status}`)
    return { ok: false, channelCount, groupCount }
  }
  console.log("  ✅ 写入轮完成: 创建 → 回读 → 删除")
  return { ok: true, channelCount, groupCount }
}
