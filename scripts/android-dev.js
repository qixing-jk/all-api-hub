// 自动获取第一个在线设备
import { execSync } from "node:child_process"

let deviceId = ""
try {
  const devices = execSync("adb devices").toString().split("\n")
  for (const line of devices) {
    const match = line.match(/^(\S+)\s+device/) // \S+ 表示设备ID，\s+ 表示任意空格/tab
    if (match) {
      deviceId = match[1]
      break
    }
  }
} catch (e) {
  console.error("请确保 adb 已经安装并连接设备", e)
  process.exit(1)
}

if (!deviceId) {
  console.error("未找到在线设备")
  process.exit(1)
}

// 构建 WXT
console.log("开始构建 WXT...")
execSync("wxt build -b firefox --mode development", { stdio: "inherit" })

// 运行 web-ext
console.log("部署到 Android Firefox...")
execSync(
  `web-ext run -t firefox-android --adb-device ${deviceId} --source-dir ./.output/firefox-mv2-dev`,
  { stdio: "inherit" }
)
