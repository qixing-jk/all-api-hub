# 肖恩站内信：状态分离与验证边界

已合并：[PR #1694](https://github.com/qixing-jk/all-api-hub/pull/1694)。协议与样本来自 2026-10-14 的调查和后续扩展验证。维护入口：[账号消息适配器](../../src/services/apiAdapters/xiaoen/messages.ts)、[行为测试](../../tests/services/apiService/xiaoen/messages.test.ts)。

## 已读、领取和弹窗确认是三个动作

原生消息实例 `id` 标识账号收到的消息，不能用共享 `templateId` 替代。实例的 `isRead/readAt`、`isClaimed/claimedAt`、`popupAcknowledgedAt` 分别代表已读、领取和弹窗确认，不能相互推导。

| 原生动作 | 当时的协议 | 扩展范围 |
| --- | --- | --- |
| 列表 | GET `/api/messages`，原生数组 | 读取账号消息，保持独立于公开公告的来源身份 |
| 单条已读 | PATCH `/api/messages`，`{messageId}` | 先核对账号及实例归属，再写一次并 GET 回读 |
| 全部已读 | PATCH `/api/messages`，`{all:true}` | 不接入；公共页面的批量已读仍是本地动作 |
| 领取 | POST `/api/messages/claim`，`{messageId}` | 不执行额度领取、优惠券领取或复制 |
| 弹窗确认 | PATCH `/api/messages/popup`，`{messageId}` | 不执行 |

领取与弹窗接口来自原生部署源码调查，不是扩展写入实测。奖励状态、额度和截止时间可作只读说明；私有券码不应进入系统通知摘要。公开公告与账号消息同文案也不能跨来源自动合并身份。

## 不能用本地未读模拟原站未读

调查账号的原站消息全部已读。后续真实扩展验证了单次已读 PATCH、服务端成功响应、GET 回读以及 UI 未读标记消失；`isClaimed` 和 `popupAcknowledgedAt` 未改变。UI 验证使用过临时本地未读缓存，因此没有建立原站未读到已读的真实状态转移。该转移只有行为测试依据，仍需原站未读样本补证。

原生前端无分页参数地接收数组，但当前样本不能证明服务器没有截断上限。coupon/image 展示缺少实样本。公共层首次扫描、历史记录已读及单向合并规则也意味着扩展不是原站未读数的严格镜像。

历史验收曾在手动扫描尚未结束时注入本地缓存，随后被扫描结果覆盖。复现时应等待扫描完成，再按记录 ID 操作虚拟列表；不能靠增加重试次数或仅查看缓存存在与否判断完成。
