# 模型推理价格说明

> 了解 Kimi 模型推理的 token 计费单位、输入输出计费方式、缓存优惠和各模型价格入口。

export const DocTable = ({columns = [], rows = []}) => {
  return <div className="doc-table-wrap">
      <table className="doc-table">
        {columns.length > 0 ? <colgroup>
            {columns.map((column, index) => <col key={index} style={column.width ? {
    width: column.width
  } : undefined} />)}
          </colgroup> : null}
        <thead>
          <tr>
            {columns.map((column, index) => <th key={index}>{column.title}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => <tr key={rowIndex}>
              {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
            </tr>)}
        </tbody>
      </table>
    </div>;
};

## 模型定价

### K3 系列模型

<DocTable
  columns={[
{ title: "模型", width: "12%" },
{ title: "计费单位", width: "10%" },
{ title: "缓存写入（TTL 5min）", width: "13%" },
{ title: "缓存写入（TTL 1h）", width: "13%" },
{ title: "输入价格（缓存命中）", width: "13%" },
{ title: "输入价格（缓存未命中）", width: "13%" },
{ title: "输出价格", width: "10%" },
{ title: "上下文窗口", width: "16%" },
]}
  rows={[
["kimi-k3", "1M tokens", "¥20.00", "¥40.00", "¥2.00", "¥20.00", "¥100.00", "1,048,576 tokens"],
]}
/>

注：**缓存写入** 是指将请求前缀写入[上下文缓存](/docs/guide/context-caching)所产生的费用。Kimi API 对重复的请求前缀自动启用上下文缓存，缓存条目按有效期（TTL）分为 5min 和 1h 两档，不指定 TTL 时默认按 5min 档。在有效期内命中缓存的输入仅按"输入价格（缓存命中）"计费，命中后缓存有效期自动续期，不再收取缓存写入费用。

### K2 系列模型

<DocTable
  columns={[
{ title: "模型", width: "24%" },
{ title: "计费单位", width: "12%" },
{ title: "输入价格（缓存命中）", width: "16%" },
{ title: "输入价格（缓存未命中）", width: "16%" },
{ title: "输出价格", width: "14%" },
{ title: "上下文窗口", width: "18%" },
]}
  rows={[
["kimi-k2.7-code", "1M tokens", "¥1.30", "¥6.50", "¥27.00", "262,144 tokens"],
["kimi-k2.7-code-highspeed", "1M tokens", "¥2.60", "¥13.00", "¥54.00", "262,144 tokens"],
["kimi-k2.6", "1M tokens", "¥1.10", "¥6.50", "¥27.00", "262,144 tokens"],
]}
/>

此处 1M = 1,000,000，表格中的价格代表每消耗 1M tokens 的价格。

## 计费基本概念

### 计费单元

Token：代表常见的字符序列，每个汉字使用的 Token 数目可能是不同的。例如，单个汉字"夔"可能会被分解为若干 Token 的组合，而像"中国"这样短且常见的短语则可能会使用单个 Token。大致来说，对于一段通常的中文文本，1 个 Token 大约相当于 1.5-2 个汉字。具体每次调用实际产生的 Tokens 数量可以通过调用[计算 Token API](/docs/api/estimate) 来获得。

### 计费逻辑

模型推理接口对 Input 和 Output 均实行按量计费。对于 K3 系列模型，缓存写入按 TTL（5min / 1h）单独计费；缓存命中的输入仅按缓存命中价格计费，不再重复收取缓存写入费用。如果您上传并抽取文档内容，并将抽取的文档内容作为 Input 传输给模型，那么文档内容也将按量计费。文件相关接口（文件内容抽取/文件存储）**限时免费**，即您只上传并抽取文档时，文件接口本身不产生费用。

## 模型说明

各模型的能力介绍与适用场景见对应的模型指南：

* [Kimi K3 模型介绍](/docs/guide/kimi-k3-quickstart)
* [Kimi K2.7 Code 模型介绍](/docs/guide/kimi-k2-7-code-quickstart)
* [Kimi K2.6 模型介绍](/docs/guide/kimi-k2-6-quickstart)
