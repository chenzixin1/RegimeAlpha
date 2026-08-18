

# RegimeAlpha

周度美股 regime 标注网页，基于用户提供的 PDF 策略框架、Massive 美股行情和 FMP 全球指数/跨资产数据生成。技术栈采用 Next.js App Router，生产站点固定部署到 Cloudflare Pages 自定义域：`https://regimealpha.chenzixin.uk/`。

## 运行

```bash
MASSIVE_API_KEY="your_massive_key" FMP_API_KEY="your_fmp_key" npm run update:data
npm run dev
```

然后打开 Next.js 打印的本地地址。

如果 `.cache/regime-alpha.sqlite` 已有完整缓存，`npm run update:data` 可不带密钥重建 JSON。

强制刷新 Massive 数据：

```bash
MASSIVE_API_KEY="your_massive_key" FMP_API_KEY="your_fmp_key" npm run update:data:refresh
```

## 数据口径

- 标的代理：`SPY` 代表美股大盘，`^VIX` 代表隐含波动，`TLT` 代表长久期债券，`QQQ`/`IWM`/行业 ETF 用于趋势、广度和相关性近似；`EWY`、`^KS11`、`^N225` 用于韩国 ETF、KOSPI 和日经指数观察。
- 频率：日线聚合为周线，输出过去五年每个有交易数据的星期。
- 模型：规则型 regime classifier，使用 PDF 中的方向漂移、实现波动、相关性、VIX、股债相关和微观结构冲击等维度。
- 行业分化：市场 regime 仍以 `SPY` 标注；sector/industry proxy 会单独标注自己的 regime，使用各自收益、波动、趋势效率、相对 SPY 强弱、回撤和相关性。`SOX` 使用流动性更好的 `SOXX` 作为半导体代理。
- 自选板块：存储板块使用 `DRAM` ETF 作为跟踪代理；BTC 使用 `BTCUSD` 作为跟踪代理。
- 缓存：本地优先使用 `.cache/regime-alpha.sqlite` 缓存 Massive 原始响应和周度 regime 结果；`REGIME_REFRESH=1` 可跳过缓存重拉。
- 前端数据：脚本同时输出 `data/regimes.json` 和 `public/data/regimes.json`，页面不直接调用 Massive。
- 数据源：Massive 优先提供美股/ETF 行情；FMP 提供 VIX、KOSPI、日经等指数，并在 Massive 缺失时回退。
- 密钥：脚本从 `MASSIVE_API_KEY` 和 `FMP_API_KEY` 环境变量读取，前端源码不包含 API key。自定义明文代理还必须显式设置 `MASSIVE_ALLOW_INSECURE_HTTP=1`。

## Cloudflare Worker 自动更新

正式站点可以由 `regimealpha-updater` Worker 定时触发数据刷新。Worker 每周二到周六北京时间 07:40 运行一次，触发 GitHub Actions 工作流；Actions 在 Node 环境里只拉取最近一段 Massive 历史行情，重算尾部窗口，重新构建 Pages，并把最新 `data/regimes.json` 与 `public/data/regimes.json` 提交回 `main`。

站点加载时会先使用构建时内置的静态数据，然后在浏览器端请求 Pages 静态文件 `/data/regimes.json`。`regimealpha-updater` 只接管 `/api/regime-update/*`，不接管 `/data/regimes.json`，避免大 JSON 经过 Worker/KV 动态响应变慢。

常用命令：

```bash
npm run deploy:worker
```

Worker 需要两个 secret：

- `GITHUB_DISPATCH_TOKEN`：用于触发 GitHub Actions workflow dispatch。
- `UPDATE_TOKEN`：手动触发 `/api/regime-update/run` 和 Actions 发布 `/api/regime-update/publish` 时使用的 bearer token 或 `token` query。

GitHub Actions 需要两个 repository secret：

- `MASSIVE_API_KEY`：Massive 数据密钥。
- `WORKER_UPDATE_TOKEN`：与 Worker 的 `UPDATE_TOKEN` 相同，用于把生成后的 JSON 发布回 Worker。

日常自动任务使用 `npm run update:data:incremental`，默认只重算最近约 120 天的周度输出，并为 52 周回撤、200 日均线、相关性等指标向前补取约 460 天上下文；`npm run update:data` 仍保留为全量 5 年兜底重建。

## 盘中 Pulse

`/pulse` 是独立的盘中敏感预警页，不改写正式周度 regime。页面打开后会每 60 秒请求一次 `/api/pulse`；没有用户访问 `/pulse` 时，不会有后台 cron 或常驻任务主动拉取 Massive。

`/api/pulse` 由 Cloudflare Pages Function 提供，从部署环境变量读取 `MASSIVE_API_KEY`，前端不会接触密钥。函数进程内有 60 秒内存缓存，同一边缘实例的重复请求会复用最近一次 Massive 结果；如果未来公开给大量用户访问，再考虑加 Cloudflare KV 做跨实例共享缓存。

盘中页包含两组主题 watchlist：

- 存储链条：`DRAM`、`MU`、`SNDK`、`000660.KS`、`005930.KS`、`WDC`、`STX`。
- 光通信链条：`AAOI`、`LITE`、`COHR`、`CIEN`、`FN`、`MTSI`、`CRDO`、`MRVL`，并把 `AVGO`、`NOK`、`CSCO`、`SMTC` 标为间接暴露。

为控制 API 压力，主题 watchlist 主要使用 batch quote；5 分钟 K 线只给核心指数和少数主题锚点。

## 原文、中文摘译与研究助手

首页包含三类研究入口：

- 原始 PDF 下载：`/articles/market-regime-transition-probability-study.pdf`
- 中文摘译下载：`/articles/market-regime-transition-probability-study.zh.md`
- 右下角研究助手：Cloudflare Pages Function `/api/chat`

研究助手通过 OpenRouter 调用 `google/gemini-2.5-flash`，并在模型或区域不可用时 fallback 到 `openrouter/auto`；回答会结合文章摘录、当前 `/data/regimes.json` 和页面选中的 week/asset。Pages 生产环境需要配置：

- `OPENROUTER_API_KEY`：OpenRouter 调用密钥。

## 数据接口与 MCP

给其他 agent 或脚本使用时，优先用这两个入口：

- JSON API：`https://regimealpha.chenzixin.uk/api/export`
- MCP endpoint：`https://regimealpha.chenzixin.uk/mcp`

JSON API 支持轻量过滤：

```bash
curl "https://regimealpha.chenzixin.uk/api/export"
curl "https://regimealpha.chenzixin.uk/api/export?symbol=DRAM&limit=8"
curl "https://regimealpha.chenzixin.uk/api/export?symbol=SOX&weekEnd=2026-05-22"
```

MCP 由 `regimealpha-mcp` Worker 提供，使用 Cloudflare Agents SDK 的 `createMcpHandler()` 实现无状态远程 MCP。本地代理：

```bash
npx mcp-remote https://regimealpha.chenzixin.uk/mcp
REGIME_MCP_URL=https://regimealpha.chenzixin.uk/mcp npm run verify:mcp-strategy
```

数据工具：

- `get_latest_regime`：返回最新大盘 regime 和资产快照。
- `get_asset_regime`：查询单个标的的当前或指定周 regime。
- `compare_assets`：比较多个标的在同一周的 regime 和关键指标。
- `list_regime_weeks`：列出近期周度 market regime，可附带一个资产序列。

策略与文章工具：

- `get_strategy_playbook`：按 regime、工具、风险或关键词返回结构化策略知识，可选原文片段或分页全文。
- `get_regime_strategy`：查询某个 regime 的策略框架、风险、转换信号和适配工具。
- `get_instrument_guidance`：查询股票、ETF、LETF、期权、OTM 期权、价差、对冲、现金等工具在不同 regime 下的适配。
- `map_position_to_regime_risks`：把持仓描述映射到当前 regime、风险标签和缺失输入，用于后续组合分析。
- `search_article_context`：按关键词搜索 PDF 提炼出的文章片段。
- `get_article_chunks`：分页返回完整文章内容，供高上下文 agent 使用。

常用部署命令：

```bash
npm run deploy:mcp
```

## GitHub 自动刷新

仓库包含 `.github/workflows/daily-data-refresh.yml`，会在工作日 22:30 UTC 运行，也可以在 GitHub Actions 页面手动触发。流程会强制刷新 Massive 数据、执行静态构建、比较 `metadata.dataThrough`，只有数据日期推进时才部署 Cloudflare Pages 并提交 `data/regimes.json` 与 `public/data/regimes.json`。

GitHub Secrets 需要配置：

- `MASSIVE_API_KEY`：Massive 数据密钥。
- `FMP_API_KEY`：FMP 数据密钥。
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare account ID。
- `CLOUDFLARE_API_TOKEN`：有 Cloudflare Pages 写权限的 API token。

## Vercel 口径

当前设计对 Vercel 友好：构建阶段运行 `npm run update:data`，运行时页面读取随部署产物一起发布的 JSON。Vercel Serverless 文件系统不适合持久写入 SQLite；如果后续要做线上定时刷新，应把缓存适配层替换为 Vercel KV/Postgres 或 Turso/libSQL，并把 `MASSIVE_API_KEY` 配到 Vercel 环境变量。
