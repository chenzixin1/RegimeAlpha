# 市场 Regime 转换概率实证动态：中文摘译版

> 说明：这是 RegimeAlpha 网站使用的中文摘译版，便于快速阅读和下载。完整英文原文见 `market-regime-transition-probability-study.pdf`。

## 核心结论

金融市场不是由一个稳定不变的概率分布支配，而是在若干不同的运行状态之间切换。传统资产定价模型常假设过程平稳或平滑变化，因此很难捕捉由宏观错位、政策变化、流动性约束或市场微观结构冲击触发的突然波动转换。

文章的核心主张是：真正有用的 regime 模型不应只判断“现在是什么状态”，还要估计“从当前状态切换到另一个状态的条件概率”。这就是 TVTP，也就是 Time-Varying Transition Probability，时变转换概率框架。

## 为什么不能只用固定 Markov 转移矩阵

传统 Markov-switching 模型假设不同 regime 之间的转移概率是固定参数，例如从低波扩张状态切到高波压力状态的概率是一个历史平均值。但现代市场高度反身，转移概率会随着可观测变量快速变化。

固定转移概率的问题包括：

- 容易产生危机后偏差，把临时性波动修复误判成可持续增长。
- 无法纳入实时重新定价的宏观、情绪、期权和仓位数据。
- 对机械化资金流、CTA、vol targeting、0DTE 和 dealer gamma 等现代市场结构反应不足。

TVTP 的改进是把转移概率写成外生协变量的函数。也就是说，模型不是只看历史 regime 频率，而是根据当下的 VIX、趋势、成交量、仓位、新闻情绪、期权结构等输入动态调整切换概率。

## Regime 分类框架

文章将市场状态拆成两个基础维度：趋势方向和波动水平。

趋势方向通常由价格相对长期均线、阶段收益和趋势效率判断。波动水平通常由 VIX、实现波动率、盘中/周内振幅和冲击事件判断。二者组合形成实际可交易的 regime taxonomy：

- Bull Quiet：上涨趋势稳定，VIX 低，个股/主题 alpha 更重要。
- Bull Volatile：价格仍在上行，但波动和拥挤上升，适合顺势但降杠杆。
- Bear Quiet：慢速下修，无明显恐慌，偏防御或相对价值。
- Bear Volatile：高波下跌、相关性接近 1，首要任务是保护凸性和流动性。
- Sideways Quiet：无明确方向且波动低，适合区间和时间价值策略。
- Sideways Volatile：净方向不强但路径剧烈，趋势跟随容易被反复打脸。
- Trend Accelerating：突破后趋势效率提升，强势主题扩散。
- Mean Reverting：趋势末端、拥挤松动，短期反转增强。
- Stagflationary：股票和债券同步承压，60/40 分散失效。
- Microstructure Dislocation：跳空、流动性断层、短期市场结构失灵。

## 哪些变量最能解释切换

文章把输入分成三层。

第一层是结构基础：宏观和基本面变量，包括收益率曲线、信用利差、就业、住房、消费、工业生产、企业盈利和资产负债表压力。它们适合定义中长期的 baseline regime，但变化较慢。

第二层是脆弱性覆盖层：仓位、CTA、系统性资金流、vol targeting、dealer gamma、期权未平仓和 skew。文章认为这些变量是现代市场里更强的领先指标，因为它们反映了“被迫交易”的结构性风险。

第三层是实时催化剂：新闻情绪、突发事件、VIX 快速跳升、0DTE 期权隐含波动和盘中成交冲击。它们单独使用噪声较大，但在市场已经拥挤或脆弱时，会成为 regime 切换的触发器。

## 为什么仓位和期权结构很关键

文章认为，现代市场的 regime 切换经常不是因为基本面突然改变，而是因为某些资金流必须根据规则交易：

- CTA 和趋势模型在价格跌破阈值时会机械减仓。
- Vol targeting 策略在实现波动上升时会降低风险暴露。
- Dealer gamma 结构会改变做市商对上涨和下跌的对冲方向。
- 0DTE 期权把日内 gamma 和流动性冲击放大。

因此，当市场处在拥挤多头、低波、低保护状态时，一个并不特别大的下跌或 VIX 上升，也可能使 off-diagonal transition probability 快速上升。

## 对期权和杠杆工具的含义

不同 regime 适合完全不同的工具：

- Bull Quiet：趋势多头、强势主题、适度卖波动更容易工作。
- Bull Volatile：仍可顺势，但要控制杠杆、期限和回撤。
- Sideways Quiet：区间、价差、时间价值策略更适配。
- Sideways Volatile：杠杆 ETF 和裸卖期权最容易被路径依赖伤害。
- Bear Volatile / Microstructure Dislocation：尾部保护、深度 OTM put、流动性管理优先。
- Trend Accelerating：杠杆工具的复利可能有正凸性，但需要在拥挤信号出现时退出。

## RegimeAlpha 当前实现对应关系

当前 RegimeAlpha 已经实现了论文框架中的一部分可观测 proxy：

- 趋势与收益：weeklyReturn、ret4w、ret13w、趋势效率、52 周回撤。
- 波动与压力：VIX、20D realized volatility、周内振幅、单日最大跌幅。
- 市场同步性：行业相关性、股债相关性。
- 微观结构冲击：放量下跌日、distribution day、down-volume z-score。
- TVTP proxy：用 weekly selloff、VIX、趋势效率、均线破位和成交冲击估计切换压力。

尚未完整接入但属于 v3 full-paper inputs 的部分：

- FRED 宏观和信用数据。
- CFTC COT 仓位 proxy。
- 新闻情绪和 analyst revisions。
- 原始 options chain、open interest、Greeks、skew、put/call。
- dealer gamma / CTA flow 的专业 vendor 或自建 proxy。

## 实操阅读方式

使用这个框架时，不要只问“现在是牛还是熊”。更应该问：

- 当前 baseline regime 是什么？
- 哪些指标正在惩罚 baseline？
- off-diagonal transition pressure 是否已经超过阈值？
- 如果 regime 切换，最可能切到哪里？
- 当前持仓在新 regime 下会暴露什么路径风险？

RegimeAlpha 页面上的红框组件就是为这个目的设计：当本周相对上周发生关键变化时，直接标出发生变化的 widget，帮助快速定位 regime 切换来自趋势、波动、成交量还是市场结构。
