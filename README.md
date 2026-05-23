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
- 自选板块：存储板块使用 `DRAM` ETF 作为跟踪代理；BTC 使用 `BTCUSD` 作为跟踪代理。
- 缓存：本地优先使用 `.cache/regime-alpha.sqlite` 缓存 FMP 原始响应和周度 regime 结果；`REGIME_REFRESH=1` 可跳过缓存重拉。
- 前端数据：脚本同时输出 `data/regimes.json` 和 `public/data/regimes.json`，页面不直接调用 FMP。
- 密钥：脚本只从 `FMP_API_KEY` 环境变量读取，前端源码不包含 API key。

## Cloudflare Worker 自动更新

正式站点现在可以由 `regimealpha-updater` Worker 定时刷新数据。Worker 每周二到周六北京时间 07:40 运行一次，触发 GitHub Actions 工作流；Actions 在 Node 环境里只拉取最近一段 FMP 历史行情，重算尾部窗口，再把结果拼回完整 `regimes.json` 并发布回 Worker，由 Worker 写入 Cloudflare KV `regimealpha_regime_data`。

站点加载时会先使用构建时内置的静态数据，然后在浏览器端请求 `/data/regimes.json`；该路径由 Worker 路由接管并返回 KV 中的最新数据。这样每日数据推进不再需要重新部署 Pages。

常用命令：

```bash
npm run deploy:worker
```

Worker 需要两个 secret：

- `GITHUB_DISPATCH_TOKEN`：用于触发 GitHub Actions workflow dispatch。
- `UPDATE_TOKEN`：手动触发 `/api/regime-update/run` 和 Actions 发布 `/api/regime-update/publish` 时使用的 bearer token 或 `token` query。

GitHub Actions 需要两个 repository secret：

- `FMP_API_KEY`：FMP 数据密钥。
- `WORKER_UPDATE_TOKEN`：与 Worker 的 `UPDATE_TOKEN` 相同，用于把生成后的 JSON 发布回 Worker。

日常自动任务使用 `npm run update:data:incremental`，默认只重算最近约 120 天的周度输出，并为 52 周回撤、200 日均线、相关性等指标向前补取约 460 天上下文；`npm run update:data` 仍保留为全量 5 年兜底重建。

## 原文 PDF 与研究助手

首页包含原始文章 PDF 入口：`/articles/market-regime-transition-probability-study.pdf`。右下角的研究助手通过 Cloudflare Pages Function `/api/chat` 调用 OpenRouter `google/gemini-3.5-flash`，结合原文摘录和 `/data/regimes.json` 最新数据回答问题。

Pages 生产环境需要配置：

- `OPENROUTER_API_KEY`：OpenRouter 调用密钥。

## Vercel 口径

当前设计对 Vercel 友好：构建阶段运行 `npm run update:data`，运行时页面读取随部署产物一起发布的 JSON。Vercel Serverless 文件系统不适合持久写入 SQLite；如果后续要做线上定时刷新，应把缓存适配层替换为 Vercel KV/Postgres 或 Turso/libSQL，并把 `FMP_API_KEY` 配到 Vercel 环境变量。
