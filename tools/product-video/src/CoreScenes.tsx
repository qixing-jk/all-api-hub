import React from "react"

import {
  AccountRow,
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
  sites,
  Stage,
  useFrame,
} from "./shared"

export const AccountsHero: React.FC = () => {
  const f = useFrame(),
    p = move(f, 18, 95)
  return (
    <Stage scale={1.12 - 0.12 * p} y={20 * (1 - p)}>
      <Panel width={1340}>
        <Header
          title="账号管理"
          right={
            <Button primary>
              <Icon name="plus" size={21} />
              添加账号
            </Button>
          }
        />
        <div style={{ padding: "24px 30px 12px", display: "flex", gap: 15 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 13,
              border: `1px solid ${C.line}`,
              borderRadius: 12,
              padding: "14px 18px",
              flex: 1,
              fontSize: 22,
              color: C.muted,
            }}
          >
            <Icon name="search" />
            搜索站点或账号
          </div>
          <Button>
            所有账号 <Icon name="down" size={18} />
          </Button>
        </div>
        <div
          style={{
            padding: "13px 32px",
            display: "flex",
            gap: 15,
            fontSize: 21,
            color: C.muted,
            borderBottom: `1px solid ${C.line}`,
          }}
        >
          共 4 个账号 <Badge blue>余额 ↓</Badge>
        </div>
        {sites.map((_, i) => (
          <AccountRow key={i} i={i} />
        ))}
      </Panel>
    </Stage>
  )
}

export const CheckinPeek: React.FC = () => {
  const f = useFrame(),
    p = move(f, 18, 38),
    ok = p > 0.55
  return (
    <Stage>
      <Panel width={1010}>
        <Header
          title="自动签到"
          icon="clock"
          right={<Badge green>已启用</Badge>}
        />
        <div style={{ padding: "35px 42px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 25,
              alignItems: "center",
            }}
          >
            <span>启用自动签到</span>
            <span
              style={{
                width: 66,
                height: 36,
                borderRadius: 30,
                background: C.blue,
                padding: 4,
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <span
                style={{
                  background: "white",
                  borderRadius: 30,
                  width: 28,
                  height: 28,
                }}
              />
            </span>
          </div>
          <div style={{ display: "flex", gap: 26, marginTop: 28 }}>
            <Field label="计划模式" value="固定时间" />
            <Field label="每日计划" value="08:30" />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 35,
              paddingTop: 28,
              borderTop: `1px solid ${C.line}`,
              fontSize: 29,
            }}
          >
            <span>北辰 API</span>
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                color: ok ? C.green : C.muted,
                transform: `scale(${1 + 0.018 * Math.sin(p * Math.PI)})`,
              }}
            >
              <Icon name={ok ? "check" : "clock"} size={31} />
              {ok ? "今日已签到" : "待执行"}
            </div>
          </div>
        </div>
      </Panel>
    </Stage>
  )
}

export const CheckinBatch: React.FC = () => {
  const f = useFrame()
  return (
    <Stage scale={1 + 0.02 * move(f, 18, 120)}>
      <Panel width={1270}>
        <Header
          title="执行结果"
          icon="clock"
          right={<Badge green>自动签到已启用</Badge>}
        />
        <div
          style={{
            display: "flex",
            gap: 60,
            padding: "28px 36px",
            borderBottom: `1px solid ${C.line}`,
          }}
        >
          <div style={{ fontSize: 23, color: C.muted }}>
            可参与{" "}
            <span style={{ color: C.ink, fontSize: 34, marginLeft: 12 }}>
              3
            </span>
          </div>
          <div style={{ fontSize: 23, color: C.muted }}>
            本次签到成功{" "}
            <span style={{ color: C.green, fontSize: 34, marginLeft: 12 }}>
              {[0, 1, 2].filter((i) => f >= 45 + i * 25).length}
            </span>
          </div>
        </div>
        <div
          style={{
            padding: "15px 36px",
            display: "grid",
            gridTemplateColumns: "1fr 1.1fr 160px",
            fontSize: 20,
            color: C.muted,
            background: C.soft,
          }}
        >
          <span>账号名称</span>
          <span>状态</span>
          <span>时间</span>
        </div>
        {sites.map((s, i) => {
          const done = i < 3 && f >= 45 + i * 25
          const p = move(f, 30 + i * 25, 45 + i * 25)
          return (
            <div
              key={s.name}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1.1fr 160px",
                alignItems: "center",
                padding: "27px 36px",
                height: 106,
                borderTop: `1px solid ${C.line}`,
                background: done ? `rgba(239,249,244,${0.5 * p})` : "white",
              }}
            >
              <div style={{ fontSize: 28 }}>
                {s.name}
                <div style={{ color: C.muted, fontSize: 18, marginTop: 7 }}>
                  {s.user}
                </div>
              </div>
              <div
                style={{
                  color: done ? C.green : C.muted,
                  fontSize: 25,
                  display: "flex",
                  alignItems: "center",
                  gap: 13,
                }}
              >
                <Icon name={done ? "check" : "clock"} />
                {done
                  ? "本次签到成功"
                  : i === 3
                    ? "暂不支持自动签到"
                    : "待执行"}
              </div>
              <span style={{ color: C.muted, fontSize: 23 }}>
                {done ? `08:30:0${i + 1}` : "—"}
              </span>
            </div>
          )
        })}
      </Panel>
    </Stage>
  )
}

const offers = [
  { name: "北辰 API", input: 0.2, output: 0.9 },
  { name: "澄川 API", input: 0.15, output: 0.65 },
  { name: "云杉模型", input: 0.18, output: 0.7 },
  { name: "棱镜 AI", input: 0.22, output: 1.1 },
]
export const PriceScene: React.FC = () => {
  const f = useFrame(),
    finished = f >= 78,
    order = [1, 2, 0, 3]
  return (
    <Stage scale={1 + 0.014 * move(f, 18, 85)}>
      <Panel width={1300}>
        <Header
          title="模型列表"
          icon="model"
          right={
            <Button>
              <Icon name="refresh" size={21} />
              刷新数据
            </Button>
          }
        />
        <div
          style={{ padding: "26px 34px", borderBottom: `1px solid ${C.line}` }}
        >
          <div style={{ display: "flex", gap: 22 }}>
            <Field
              label="搜索模型"
              value={
                <>
                  <Icon name="search" color={C.muted} />
                  <span style={{ marginLeft: 15 }}>gpt-4o-mini</span>
                </>
              }
            />
            <Field label="排序方式" width={460} value="同模型最低价优先" />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 22,
              marginTop: 24,
              fontSize: 22,
              color: C.muted,
            }}
          >
            <span style={{ fontWeight: 600, color: C.ink }}>比较模型价格</span>
            <Badge>普通对话</Badge>
            <span>输入 85% · 输出 15%</span>
          </div>
        </div>
        <div
          style={{
            padding: "19px 34px",
            fontSize: 23,
            background: C.soft,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>openai / gpt-4o-mini</span>
          <Badge>可比较报价：4</Badge>
        </div>
        <div style={{ margin: "0 24px" }}>
          {order.map((i, row) => {
            const o = offers[i],
              low = i === 1,
              show = out(f, 18 + row * 9, 43 + row * 9)
            return (
              <div
                key={o.name}
                style={{
                  height: 93,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 14px",
                  borderBottom: `1px solid ${C.line}`,
                  background: low
                    ? `rgba(243,250,246,${out(f, 78, 98)})`
                    : "white",
                  borderRadius: low ? 12 : 0,
                }}
              >
                <div
                  style={{
                    fontSize: 28,
                    display: "flex",
                    gap: 18,
                    alignItems: "center",
                  }}
                >
                  <Icon name="model" color={C.muted} />
                  {o.name}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
                  <div style={{ opacity: low ? out(f, 78, 98) : 0 }}>
                    <Badge green>本次比较最低</Badge>
                  </div>
                  <div
                    style={{
                      fontSize: 32,
                      fontWeight: 600,
                      width: 155,
                      textAlign: "right",
                      color: low && finished ? C.green : C.ink,
                      opacity: show,
                      transform: `translateY(${8 * (1 - show)}px)`,
                    }}
                  >
                    {" "}
                    ${(o.input * 0.85 + o.output * 0.15).toFixed(4)}
                  </div>
                  <span style={{ fontSize: 20, color: C.muted }}>
                    / 百万 Token
                  </span>
                </div>
              </div>
            )
          })}
        </div>
        <div
          style={{
            padding: "18px 35px",
            fontSize: 19,
            color: C.muted,
            borderTop: `1px solid ${C.line}`,
          }}
        >
          预估综合单价 · 按当前输入 / 输出占比估算
        </div>
      </Panel>
    </Stage>
  )
}

export const AccountsList: React.FC = () => {
  const f = useFrame(),
    p = move(f, 20, 78)
  return (
    <Stage>
      <Panel width={1370}>
        <Header
          title="账号管理"
          right={
            <Button>
              <Icon name="refresh" size={20} />
              刷新
            </Button>
          }
        />
        <div
          style={{
            padding: "22px 30px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 23,
            color: C.muted,
          }}
        >
          <span>共 4 个账号</span>
          <Badge blue>余额 ↓</Badge>
        </div>
        <div style={{ height: 490, position: "relative", margin: "0 38px" }}>
          {sites.map((_, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 10 + 112 * i + 8 * i * (1 - p),
                transform: `translateX(${(i % 2 === 0 ? -20 : 20) * (1 - p)}px)`,
                borderRadius: 18 * (1 - p),
                border: `1px solid rgba(231,233,237,${1 - p})`,
                overflow: "hidden",
              }}
            >
              <AccountRow i={i} />
            </div>
          ))}
        </div>
      </Panel>
    </Stage>
  )
}

export const AccountsSummary: React.FC = () => {
  const f = useFrame(),
    p = out(f, 18, 65),
    data = [
      ["总余额", 248.2, C.ink],
      ["今日消费", 4.23, C.ink],
      ["今日收入", 3.7, C.green],
    ] as const
  return (
    <Stage>
      <Panel width={1350}>
        <Header title="账号管理" right={<Badge blue>所有账号 · 4</Badge>} />
        <div style={{ padding: "45px 38px 32px", display: "flex", gap: 24 }}>
          {data.map(([label, n, color]) => (
            <div
              key={label}
              style={{
                flex: 1,
                padding: "28px 30px",
                background: C.soft,
                border: `1px solid ${C.line}`,
                borderRadius: 16,
              }}
            >
              <div style={{ fontSize: 25, color: C.muted }}>{label}</div>
              <div
                style={{
                  fontSize: 56,
                  fontWeight: 600,
                  letterSpacing: "-.03em",
                  marginTop: 20,
                  color,
                }}
              >
                {money(n * p)}
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            padding: "4px 38px 36px",
            display: "flex",
            alignItems: "center",
            gap: 18,
          }}
        >
          {sites.map((s) => (
            <Badge key={s.name}>{s.name}</Badge>
          ))}
        </div>
      </Panel>
    </Stage>
  )
}

export const CredentialsScene: React.FC = () => {
  const f = useFrame(),
    p = move(f, 18, 83)
  return (
    <Stage>
      <Panel width={1280}>
        <Header
          title="API 凭据库"
          icon="key"
          right={
            <Button primary>
              <Icon name="plus" size={20} />
              添加凭据
            </Button>
          }
        />
        <div style={{ padding: "30px 38px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 27,
            }}
          >
            <div style={{ fontSize: 31, fontWeight: 600 }}>北辰 API</div>
            <Badge blue>OpenAI Compatible</Badge>
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <Field label="Base URL" value="https://north.example.invalid/v1" />
            <Field width={420} label="API Key" value="sk-demo-••••••••••••" />
          </div>
          <div
            style={{
              height: 105 * p,
              opacity: out(f, 32, 73),
              overflow: "hidden",
              marginTop: 24 * p,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "23px 26px",
                background: C.soft,
                borderRadius: 14,
                border: `1px solid ${C.line}`,
              }}
            >
              <Icon name="model" color={C.muted} />
              <span style={{ fontSize: 24, color: C.muted }}>默认模型</span>
              <span style={{ fontSize: 27 }}>gpt-4o-mini</span>
              <span style={{ marginLeft: "auto" }}>
                <Button>
                  导出 Kilo Code JSON <Icon name="arrow" size={20} />
                </Button>
              </span>
            </div>
          </div>
        </div>
      </Panel>
    </Stage>
  )
}
