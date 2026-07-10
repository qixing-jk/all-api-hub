const finiteNumber = (value) => {
  if (value == null || value === "") return null
  return Number.isFinite(Number(value)) ? Number(value) : null
}

export function gatewaySpent(record) {
  const stored = finiteNumber(record?.gatewaySpent)
  if (stored != null) return stored
  if (record?.usageStatus === "gateway-usage") {
    return finiteNumber(record?.spent)
  }
  return null
}

export function usageState(record) {
  if (record?.usageTruncated === true) return "incomplete"
  const spent = gatewaySpent(record)
  if (spent != null) {
    return spent > 0 || Number(record?.requestCount) > 0 ? "used" : "unused"
  }
  return "pending"
}

export function filterUsageRecords(records, filters = {}) {
  const query = String(filters.query || "")
    .trim()
    .toLocaleLowerCase("zh-CN")
  return records.filter((record) => {
    if (filters.target && record.targetName !== filters.target) return false
    if (filters.provider && record.providerName !== filters.provider)
      return false
    if (filters.status && usageState(record) !== filters.status) return false
    if (!query) return true
    return [
      record.targetName,
      record.targetUrl,
      record.providerName,
      record.channelName,
      record.channelId,
      record.keyHint,
      record.keyFingerprint,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("zh-CN").includes(query))
  })
}

export function summarizeUsageRecords(records) {
  const summary = {
    recordCount: records.length,
    quotaTotal: 0,
    knownQuotaCount: 0,
    unknownQuotaCount: 0,
    trackedCount: 0,
    trackedQuotaTotal: 0,
    trackedRemainingTotal: 0,
    gatewaySpentTotal: 0,
    requestCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    usedKeyCount: 0,
    unusedKeyCount: 0,
    pendingCount: 0,
    incompleteCount: 0,
    detailIncompleteCount: 0,
    lastCheckedAt: null,
  }

  for (const record of records) {
    const quota = finiteNumber(record.quota)
    const spent = gatewaySpent(record)
    const status = usageState(record)
    if (quota == null) {
      summary.unknownQuotaCount += 1
    } else {
      summary.knownQuotaCount += 1
      summary.quotaTotal += quota
    }
    if (spent != null) {
      summary.trackedCount += 1
      summary.gatewaySpentTotal += spent
      if (quota != null) {
        summary.trackedQuotaTotal += quota
        summary.trackedRemainingTotal += Math.max(0, quota - spent)
      }
    }
    summary.requestCount += Number(record.requestCount) || 0
    summary.promptTokens += Number(record.promptTokens) || 0
    summary.completionTokens += Number(record.completionTokens) || 0
    if (status === "used") summary.usedKeyCount += 1
    if (status === "unused") summary.unusedKeyCount += 1
    if (status === "pending") summary.pendingCount += 1
    if (status === "incomplete") summary.incompleteCount += 1
    if (record?.usageDetailsComplete === false) {
      summary.detailIncompleteCount += 1
    }
    const checkedAt = Date.parse(record.checkedAt || "")
    if (
      Number.isFinite(checkedAt) &&
      (!summary.lastCheckedAt || checkedAt > summary.lastCheckedAt)
    ) {
      summary.lastCheckedAt = checkedAt
    }
  }

  return summary
}

export function localDateKey(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function filterUsageDashboardRecords(records, filters = {}) {
  return records.filter((record) => {
    if (filters.targetUrl && record.targetUrl !== filters.targetUrl)
      return false
    const importedDate = localDateKey(record.importedAt)
    if (!importedDate) return false
    if (filters.startDate && importedDate < filters.startDate) return false
    if (filters.endDate && importedDate > filters.endDate) return false
    return true
  })
}

export function summarizeUsageDashboard(records) {
  const summary = summarizeUsageRecords(records)
  return {
    ...summary,
    remainingPercent:
      summary.trackedQuotaTotal > 0
        ? (summary.trackedRemainingTotal / summary.trackedQuotaTotal) * 100
        : null,
    coveragePercent:
      summary.recordCount > 0
        ? (summary.trackedCount / summary.recordCount) * 100
        : 0,
  }
}

export function groupUsageDashboardByTarget(records) {
  const groups = new Map()
  for (const record of records) {
    const key = record.targetUrl || "unknown"
    const group = groups.get(key) || {
      targetUrl: record.targetUrl || "未记录地址",
      targetName: record.targetName || "New API",
      records: [],
    }
    group.records.push(record)
    groups.set(key, group)
  }
  return [...groups.values()]
    .map((group) => ({
      targetUrl: group.targetUrl,
      targetName: group.targetName,
      summary: summarizeUsageDashboard(group.records),
    }))
    .sort((left, right) =>
      left.targetName.localeCompare(right.targetName, "zh-CN"),
    )
}

export function groupUsageDashboardByDay(records) {
  const groups = new Map()
  for (const record of records) {
    const date = localDateKey(record.importedAt)
    if (!date) continue
    const group = groups.get(date) || []
    group.push(record)
    groups.set(date, group)
  }
  return [...groups.entries()]
    .map(([date, dayRecords]) => ({
      date,
      summary: summarizeUsageDashboard(dayRecords),
    }))
    .sort((left, right) => left.date.localeCompare(right.date))
}
