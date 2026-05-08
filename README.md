# RegimeAlpha

周度美股 regime 标注网页，基于用户提供的 PDF 策略框架和 Financial Modeling Prep 历史行情数据生成。技术栈采用 Next.js App Router，方便后续部署到 Vercel。

## 运行

```bash
FMP_API_KEY="your_key_here" npm run update:data
npm run dev
```

然后打开 Next.js 打印的本地地址。

如果 `.cache/regime-alpha.sqlite` 已有完整缓存，`npm run update:data` 可不带密钥重建 JSON。

强制刷新 FMP 数据：

```bash
FMP_API_KEY="your_key_here" npm run update:data:refresh
```

## 数据口径

- 标的代理：`SPY` 代表美股大盘，`^VIX` 代表隐含波动，`TLT` 代表长久期债券，`QQQ`/`IWM`/行业 ETF 用于趋势、广度和相关性近似。
- 频率：日线聚合为周线，输出过去五年每个有交易数据的星期。
- 模型：规则型 regime classifier，使用 PDF 中的方向漂移、实现波动、相关性、VIX、股债相关和微观结构冲击等维度。
- 行业分化：市场 regime 仍以 `SPY` 标注；sector/industry proxy 会单独标注自己的 regime，使用各自收益、波动、趋势效率、相对 SPY 强弱、回撤和相关性。`SOX` 目前用 `SOXX` 作为半导体代理，因为 FMP EOD 对 `^SOX` 没有返回历史日线。
- 缓存：本地优先使用 `.cache/regime-alpha.sqlite` 缓存 FMP 原始响应和周度 regime 结果；`REGIME_REFRESH=1` 可跳过缓存重拉。
- 前端数据：脚本同时输出 `data/regimes.json` 和 `public/data/regimes.json`，页面不直接调用 FMP。
- 密钥：脚本只从 `FMP_API_KEY` 环境变量读取，前端源码不包含 API key。

## Vercel 口径

当前设计对 Vercel 友好：构建阶段运行 `npm run update:data`，运行时页面读取随部署产物一起发布的 JSON。Vercel Serverless 文件系统不适合持久写入 SQLite；如果后续要做线上定时刷新，应把缓存适配层替换为 Vercel KV/Postgres 或 Turso/libSQL，并把 `FMP_API_KEY` 配到 Vercel 环境变量。
