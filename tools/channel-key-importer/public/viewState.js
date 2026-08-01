export const APP_VIEWS = Object.freeze({
  import: {
    eyebrow: "渠道操作",
    title: "导入渠道",
    description: "选择供应商，录入 Key，然后写入当前 New API。",
  },
  tasks: {
    eyebrow: "自动执行",
    title: "定时任务",
    description: "查看待执行批次，调整时间、数量和执行间隔。",
  },
  usage: {
    eyebrow: "额度与消耗",
    title: "用量监测",
    description: "按站点和录入日期查看额度、消耗与剩余比例。",
  },
  records: {
    eyebrow: "写入历史",
    title: "上 Key 记录",
    description: "按批次查看什么时候写入、写入多少以及后续消耗。",
  },
  sites: {
    eyebrow: "连接管理",
    title: "站点设置",
    description: "添加和切换 New API，管理系统访问令牌。",
  },
})

const LEGACY_VIEW_HASHES = Object.freeze({
  importer: "import",
  connection: "sites",
  schedules: "tasks",
  "usage-monitor": "usage",
})

export function normalizeAppView(value) {
  const key = String(value || "")
    .trim()
    .replace(/^#/, "")
  const normalized = LEGACY_VIEW_HASHES[key] || key
  return Object.hasOwn(APP_VIEWS, normalized) ? normalized : "import"
}
