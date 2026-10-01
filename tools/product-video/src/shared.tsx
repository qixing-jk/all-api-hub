import React from "react"
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion"

// Video-only UI. No imports or mutations in the production extension.
export const C = {
  bg: "#dadada",
  ink: "#182230",
  muted: "#75808d",
  line: "#e7e9ed",
  blue: "#185cff",
  green: "#008e50",
  soft: "#f7f8fa",
}
export const FONT =
  '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Segoe UI", sans-serif'
export const move = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.65, 0, 0.25, 1),
  })
export const out = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  })
export const money = (n: number) => "$" + n.toFixed(2)
export const icons = {
  account: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 22v-2a8 8 0 0 1 16 0v2" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  chart: (
    <>
      <path d="M4 3v17h17M7 14l4-4 4 3 5-7" />
    </>
  ),
  model: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="3" />
      <path d="M9 1v4m6-4v4M9 19v4m6-4v4M1 9h4m-4 6h4m14-6h4m-4 6h4" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="8" r="5" />
      <path d="m12 12 9 9m-4-4 3-3m-6 0 3-3" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5" />
    </>
  ),
  search: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="m15 15 6 6" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2m3 6a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2" />
    </>
  ),
  arrow: <path d="m9 5 7 7-7 7" />,
  down: <path d="m6 9 6 6 6-6" />,
  plus: <path d="M12 4v16M4 12h16" />,
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </>
  ),
  layers: (
    <>
      <path d="m12 2 10 6-10 6L2 8Zm-10 11 10 6 10-6M2 18l10 6 10-6" />
    </>
  ),
}
export const Icon: React.FC<{
  name: keyof typeof icons
  size?: number
  color?: string
}> = ({ name, size = 24, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    {icons[name]}
  </svg>
)
export const Badge: React.FC<{
  children: React.ReactNode
  green?: boolean
  blue?: boolean
}> = ({ children, green = false, blue = false }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      padding: "7px 13px",
      borderRadius: 20,
      fontSize: 20,
      lineHeight: 1,
      color: green ? C.green : blue ? C.blue : C.muted,
      background: green ? "#eff9f4" : blue ? "#eef3ff" : "#eef0f3",
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </span>
)
export const Button: React.FC<{
  children: React.ReactNode
  primary?: boolean
}> = ({ children, primary = false }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      padding: "12px 20px",
      fontSize: 22,
      borderRadius: 12,
      border: `1px solid ${primary ? C.blue : C.line}`,
      color: primary ? "white" : C.ink,
      background: primary ? C.blue : "white",
    }}
  >
    {children}
  </span>
)
export const Stage: React.FC<{
  children: React.ReactNode
  scale?: number
  x?: number
  y?: number
}> = ({ children, scale = 1, x = 0, y = 0 }) => (
  <AbsoluteFill
    style={{
      background: C.bg,
      color: C.ink,
      fontFamily: FONT,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      fontVariantNumeric: "tabular-nums",
    }}
  >
    <div
      data-product-panel
      style={{
        transform: `translate(${x}px,${y}px) scale(${scale})`,
        transformOrigin: "center",
      }}
    >
      {children}
    </div>
    <span
      style={{
        position: "absolute",
        right: 110,
        bottom: 65,
        fontSize: 19,
        color: "#92979c",
      }}
    >
      演示数据
    </span>
  </AbsoluteFill>
)
export const Panel: React.FC<{
  children: React.ReactNode
  width?: number
  style?: React.CSSProperties
}> = ({ children, width = 1320, style }) => (
  <div
    style={{
      width,
      background: "white",
      border: "1px solid #e5e6e8",
      borderRadius: 26,
      overflow: "hidden",
      boxShadow:
        "0 24px 68px -42px rgba(28,35,43,.32), 0 2px 4px rgba(28,35,43,.025)",
      ...style,
    }}
  >
    {children}
  </div>
)
export const Header: React.FC<{
  title: string
  icon?: keyof typeof icons
  right?: React.ReactNode
}> = ({ title, icon = "account", right }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "25px 34px",
      borderBottom: `1px solid ${C.line}`,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <Img
        src={staticFile("product-shots/icon.png")}
        style={{ width: 38, height: 38 }}
      />
      <span style={{ fontSize: 24, fontWeight: 600 }}>All API Hub</span>
      <span
        style={{ height: 24, width: 1, background: C.line, margin: "0 10px" }}
      />
      <Icon name={icon} color={C.muted} />
      <span style={{ fontSize: 27, fontWeight: 600 }}>{title}</span>
    </div>
    {right}
  </div>
)
export const Field: React.FC<{
  label: string
  value: React.ReactNode
  width?: number
}> = ({ label, value, width }) => (
  <div style={{ width, flex: width ? undefined : 1 }}>
    <div style={{ fontSize: 22, color: C.muted, marginBottom: 12 }}>
      {label}
    </div>
    <div
      style={{
        minHeight: 58,
        border: `1px solid ${C.line}`,
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        padding: "0 18px",
        fontSize: 26,
        background: "white",
      }}
    >
      {value}
    </div>
  </div>
)
export const useFrame = useCurrentFrame
export const sites = [
  { name: "北辰 API", user: "chen_demo", balance: 97, spend: 1.3, income: 1.5 },
  { name: "澄川 API", user: "an_demo", balance: 74.5, spend: 0.36, income: 1 },
  {
    name: "云杉模型",
    user: "lin_demo",
    balance: 51.5,
    spend: 0.68,
    income: 1.2,
  },
  { name: "棱镜 AI", user: "yu_demo", balance: 25.2, spend: 1.89, income: 0 },
]
export const AccountRow: React.FC<{
  i: number
  balance?: number
  checked?: boolean
  style?: React.CSSProperties
}> = ({ i, balance, checked = true, style }) => {
  const s = sites[i]
  return (
    <div
      style={{
        height: 112,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 30px",
        borderBottom: i < 3 ? `1px solid ${C.line}` : undefined,
        background: "white",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <span
          style={{ width: 9, height: 9, borderRadius: 9, background: C.green }}
        />
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontSize: 28,
            }}
          >
            <Badge>new-api</Badge>
            {s.name}
            {i < 3 && (
              <Icon
                name={checked ? "check" : "clock"}
                size={23}
                color={checked ? C.green : C.muted}
              />
            )}
          </div>
          <div
            style={{
              fontSize: 19,
              color: C.muted,
              marginTop: 9,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon name="account" size={16} />
            {s.user}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 30,
          color: C.muted,
          marginLeft: "auto",
          marginRight: 85,
        }}
      >
        <Icon name="link" />
        <Icon name="key" />
        <span style={{ fontSize: 28, lineHeight: 0 }}>···</span>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 34, fontWeight: 600 }}>
          {money(balance ?? s.balance)}
        </div>
        <div style={{ fontSize: 18, marginTop: 5, color: C.muted }}>
          <span style={{ color: C.green }}>−{money(s.spend)}</span>
          <span style={{ marginLeft: 12 }}>+{money(s.income)}</span>
        </div>
      </div>
    </div>
  )
}
