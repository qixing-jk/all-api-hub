import React, { Fragment, type CSSProperties, type FC } from "react"

import {
  Badge,
  Button,
  C,
  Field,
  Header,
  Icon,
  money,
  move,
  out,
  Panel,
  Stage,
  useFrame,
} from "./shared"

const labelStyle: CSSProperties = { fontSize: 21, color: C.muted }

/** Account creation uses the real URL -> detect -> review flow. */
export const AddAccountScene: FC = () => {
  const f = useFrame()
  const reveal = out(f, 34, 68)
  const detect = move(f, 22, 34)
  const buttonIn = out(f, 53, 69)
  const detecting = f >= 26 && f < 39
  const detected = f >= 39
  return (
    <Stage>
      <Panel width={1320} style={{ transform: "translateY(8px)" }}>
        <Header title="添加账号" icon="account" />
        <div style={{ padding: "28px 38px 34px" }}>
          <div style={{ display: "flex", alignItems: "end", gap: 22 }}>
            <Field
              label="站点 URL"
              value={
                <span style={{ fontSize: 25 }}>
                  https://north.example.invalid
                </span>
              }
            />
            <Badge green>
              <Icon name="check" size={19} />
              已登录
            </Badge>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 22,
              height: 58,
            }}
          >
            <div
              style={{
                opacity: detect,
                transform: `translateY(${(1 - detect) * 8}px)`,
              }}
            >
              <Button primary>
                <Icon name="refresh" size={21} />
                自动识别
              </Button>
            </div>
          </div>
          <div
            style={{
              height: 31,
              margin: "3px 0 16px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 19,
              color: detected ? C.green : C.muted,
            }}
          >
            <span style={{ opacity: detecting || detected ? 1 : 0 }}>
              <Icon
                name={detected ? "check" : "refresh"}
                size={18}
                color={detected ? C.green : C.muted}
              />
            </span>
            <span style={{ opacity: detecting || detected ? 1 : 0 }}>
              {detected ? "自动识别成功" : detecting ? "正在识别账号信息" : ""}
            </span>
            <div
              style={{
                flex: 1,
                height: 5,
                marginLeft: 8,
                borderRadius: 8,
                background: "#f0f2f5",
                overflow: "hidden",
                opacity: detecting ? 1 : 0,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.min(100, Math.max(0, ((f - 20) / 16) * 100))}%`,
                  background: C.blue,
                  opacity: f < 21 ? 0 : 1,
                }}
              />
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "21px 24px",
            }}
          >
            <Field
              label="站点名称"
              value={<span style={{ opacity: reveal }}>北辰 API</span>}
            />
            <Field
              label="站点类型"
              value={<span style={{ opacity: reveal }}>New API</span>}
            />
            <Field
              label="用户名"
              value={
                <span
                  style={{ opacity: reveal, color: reveal ? C.ink : C.muted }}
                >
                  {reveal ? "chen_demo" : "等待识别"}
                </span>
              }
            />
            <Field
              label="访问令牌"
              value={
                <span
                  style={{ opacity: reveal, letterSpacing: reveal ? 4 : 0 }}
                >
                  {reveal ? "••••••••••••••••" : "等待识别"}
                </span>
              }
            />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 27,
            }}
          >
            <span style={{ fontSize: 20, color: C.muted, opacity: reveal }}>
              请核对识别结果后再添加
            </span>
            <div
              style={{
                opacity: buttonIn,
                transform: `translateY(${(1 - buttonIn) * 7}px)`,
              }}
            >
              <Button primary>确认添加</Button>
            </div>
          </div>
        </div>
      </Panel>
    </Stage>
  )
}

const AnnouncementMetric: FC<{
  label: string
  value: number
  icon: "bell" | "check" | "layers"
}> = ({ label, value, icon }) => (
  <div
    style={{
      flex: 1,
      padding: "17px 21px",
      border: `1px solid ${C.line}`,
      borderRadius: 14,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}
  >
    <div>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: 34, fontWeight: 600, marginTop: 5 }}>{value}</div>
    </div>
    <Icon name={icon} size={25} color={C.muted} />
  </div>
)

/** Cached announcements: one card expands; no simulated live polling. */
export const AnnouncementsScene: FC = () => {
  const f = useFrame()
  const expand = out(f, 20, 66)
  const bodyHeight = interpolateSafe(expand, 0, 112)
  return (
    <Stage>
      <Panel width={1370}>
        <Header
          title="网站公告"
          icon="bell"
          right={
            <Button>
              <Icon name="refresh" size={19} />
              立即检查
            </Button>
          }
        />
        <div style={{ padding: "25px 34px 30px" }}>
          <div style={{ display: "flex", gap: 15, marginBottom: 19 }}>
            <AnnouncementMetric label="公告总数" value={4} icon="bell" />
            <AnnouncementMetric label="未读公告" value={2} icon="check" />
            <AnnouncementMetric label="涉及站点" value={3} icon="layers" />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "4px 2px 13px",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 600 }}>最近公告</div>
            <div style={{ display: "flex", gap: 9 }}>
              <Badge>全部站点</Badge>
              <Badge>全部状态</Badge>
            </div>
          </div>
          <div
            style={{
              border: `1px solid ${C.line}`,
              borderRadius: 15,
              overflow: "hidden",
              marginBottom: 11,
            }}
          >
            <div
              style={{
                padding: "17px 21px",
                display: "flex",
                alignItems: "center",
                gap: 15,
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 9,
                  background: C.blue,
                }}
              />
              <span style={{ fontSize: 26, fontWeight: 600 }}>
                模型列表更新
              </span>
              <Badge blue>未读</Badge>
              <span
                style={{ marginLeft: "auto", fontSize: 20, color: C.muted }}
              >
                北辰 API　·　今天
              </span>
              <Icon name="down" size={20} color={C.muted} />
            </div>
            <div
              style={{
                height: bodyHeight,
                overflow: "hidden",
                opacity: expand,
                borderTop: `1px solid ${C.line}`,
              }}
            >
              <div
                style={{
                  padding: "17px 46px 20px",
                  fontSize: 23,
                  lineHeight: 1.55,
                  color: "#44505d",
                }}
              >
                新增模型已加入列表，可在模型页面查看。
                <div style={{ marginTop: 12, fontSize: 18, color: C.muted }}>
                  演示内容 · 来源：北辰 API
                </div>
              </div>
            </div>
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}
          >
            <div
              style={{
                border: `1px solid ${C.line}`,
                borderRadius: 13,
                padding: "17px 20px",
                fontSize: 22,
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 8,
                  background: "#c4cad2",
                }}
              />
              <span>维护窗口通知</span>
              <span
                style={{ marginLeft: "auto", fontSize: 19, color: C.muted }}
              >
                澄川 API
              </span>
            </div>
            <div
              style={{
                border: `1px solid ${C.line}`,
                borderRadius: 13,
                padding: "17px 20px",
                fontSize: 22,
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 8,
                  background: "#c4cad2",
                }}
              />
              <span>服务状态更新</span>
              <span
                style={{ marginLeft: "auto", fontSize: 19, color: C.muted }}
              >
                云杉模型
              </span>
            </div>
          </div>
        </div>
      </Panel>
    </Stage>
  )
}

const interpolateSafe = (value: number, start: number, end: number) =>
  start + (end - start) * value

/** Historical usage analytics, kept separate from balance-history figures. */
export const UsageScene: FC = () => {
  const f = useFrame()
  const reveal = out(f, 18, 70)
  const bars = [
    { name: "gpt-4o", value: 7.68, color: "#185cff" },
    { name: "gpt-4o-mini", value: 3.2, color: "#7c9cff" },
    { name: "其它", value: 1.92, color: "#c5d1ea" },
  ]
  return (
    <Stage scale={1 + 0.006 * out(f, 18, 86)}>
      <Panel width={1320}>
        <Header title="用量分析" icon="chart" right={<Badge>近 7 天</Badge>} />
        <div style={{ padding: "28px 38px 37px" }}>
          <div style={{ display: "flex", gap: 18, marginBottom: 25 }}>
            <Metric label="费用" value="$12.80" />
            <Metric label="请求数" value="320" />
            <Metric label="总 Tokens" value="1.6M" />
          </div>
          <div
            style={{
              border: `1px solid ${C.line}`,
              borderRadius: 18,
              padding: "26px 30px 29px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 28,
              }}
            >
              <div>
                <div style={{ fontSize: 28, fontWeight: 600 }}>
                  模型花费分布
                </div>
                <div style={{ fontSize: 19, color: C.muted, marginTop: 6 }}>
                  近 7 天 · 按模型统计
                </div>
              </div>
              <Badge>USD</Badge>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 23 }}>
              {bars.map((item) => {
                const width = Math.min(100, (item.value / 12.8) * 100 * reveal)
                return (
                  <div
                    key={item.name}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "210px 1fr 130px",
                      alignItems: "center",
                      gap: 20,
                    }}
                  >
                    <span style={{ fontSize: 24, fontWeight: 500 }}>
                      {item.name}
                    </span>
                    <div
                      style={{
                        height: 23,
                        borderRadius: 20,
                        background: "#f0f2f5",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${width}%`,
                          borderRadius: 20,
                          background: item.color,
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 25,
                        fontWeight: 600,
                        textAlign: "right",
                        opacity: reveal,
                      }}
                    >
                      {money(item.value)}
                    </span>
                  </div>
                )
              })}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 27,
                paddingTop: 18,
                borderTop: `1px solid ${C.line}`,
                fontSize: 19,
                color: C.muted,
              }}
            >
              <span>费用为额度消耗折算值</span>
              <span>覆盖范围：已同步的账号</span>
            </div>
          </div>
        </div>
      </Panel>
    </Stage>
  )
}

const Metric: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div
    style={{
      flex: 1,
      padding: "16px 21px",
      border: `1px solid ${C.line}`,
      borderRadius: 13,
    }}
  >
    <div style={labelStyle}>{label}</div>
    <div style={{ fontSize: 32, fontWeight: 600, marginTop: 6 }}>{value}</div>
  </div>
)

/** Connected gateway channel inventory and a masked, editable channel summary. */
export const GatewayScene: FC = () => {
  const f = useFrame()
  const expand = out(f, 18, 67)
  const rows = [
    {
      name: "OpenAI 主用",
      type: "OpenAI",
      status: "启用",
      models: "4",
      priority: "1",
      weight: "1",
    },
    {
      name: "Claude 兼容",
      type: "Anthropic",
      status: "启用",
      models: "3",
      priority: "2",
      weight: "1",
    },
    {
      name: "备用渠道",
      type: "OpenAI",
      status: "停用",
      models: "2",
      priority: "3",
      weight: "1",
    },
  ]
  const headerCells = ["渠道", "类型", "状态", "模型数量", "优先级", "权重"]
  const widths = ["30%", "17%", "15%", "15%", "12%", "11%"]
  return (
    <Stage>
      <Panel width={1390}>
        <Header
          title="渠道管理"
          icon="layers"
          right={<Badge blue>自建 AI 网关</Badge>}
        />
        <div style={{ padding: "24px 30px 27px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 18,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Badge>New API</Badge>
              <span style={{ fontSize: 20, color: C.muted }}>渠道 · 3</span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Badge>刷新</Badge>
              <Button primary>新增渠道</Button>
            </div>
          </div>
          <div
            style={{
              border: `1px solid ${C.line}`,
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: widths.join(" "),
                padding: "14px 18px",
                background: "#f7f8fa",
                borderBottom: `1px solid ${C.line}`,
              }}
            >
              {headerCells.map((cell) => (
                <span key={cell} style={{ fontSize: 19, color: C.muted }}>
                  {cell}
                </span>
              ))}
            </div>
            {rows.map((row, i) => (
              <Fragment key={row.name}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: widths.join(" "),
                    alignItems: "center",
                    padding: "18px",
                    minHeight: 68,
                    borderBottom: `1px solid ${C.line}`,
                    background: i === 0 ? "#fbfcff" : "white",
                  }}
                >
                  <span
                    style={{
                      fontSize: 22,
                      fontWeight: i === 0 ? 600 : 500,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    {i === 0 && <Icon name="down" size={16} color={C.blue} />}
                    {row.name}
                  </span>
                  <span style={{ fontSize: 20 }}>{row.type}</span>
                  <span>
                    <Badge green={row.status === "启用"}>{row.status}</Badge>
                  </span>
                  <span style={{ fontSize: 21 }}>{row.models}</span>
                  <span style={{ fontSize: 21 }}>{row.priority}</span>
                  <span style={{ fontSize: 21 }}>{row.weight}</span>
                </div>
                {i === 0 && (
                  <div
                    style={{
                      height: 154 * expand,
                      overflow: "hidden",
                      background: "#fbfcff",
                      borderBottom: `1px solid ${C.line}`,
                    }}
                  >
                    <div
                      style={{
                        padding: "15px 22px 19px 50px",
                        display: "grid",
                        gridTemplateColumns: "1.5fr 1fr",
                        gap: 16,
                        opacity: expand,
                        transform: `translateY(${(1 - expand) * 8}px)`,
                      }}
                    >
                      <div>
                        <div style={labelStyle}>基础 URL</div>
                        <div style={{ fontSize: 21, marginTop: 7 }}>
                          https://north.example.invalid/v1
                        </div>
                      </div>
                      <div>
                        <div style={labelStyle}>渠道密钥</div>
                        <div
                          style={{
                            fontSize: 21,
                            marginTop: 7,
                            letterSpacing: 2,
                          }}
                        >
                          sk-demo-••••••••9K3D
                        </div>
                      </div>
                      <div
                        style={{
                          gridColumn: "1 / -1",
                          display: "flex",
                          gap: 9,
                          alignItems: "center",
                          fontSize: 19,
                          color: C.muted,
                        }}
                      >
                        <Badge green>启用</Badge>
                        <span>模型 · 4　可用分组 · default</span>
                      </div>
                    </div>
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        </div>
      </Panel>
    </Stage>
  )
}
