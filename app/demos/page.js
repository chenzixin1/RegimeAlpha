import styles from "./RegimeDemoSuite.module.css";

export const metadata = {
  title: "RegimeAlpha · 三种下钻方案"
};

const demos = [
  { key: "a", title: "排名卡片型", note: "先扫强弱，再展开单一板块的 52 周研究面板。", accent: "#15724d" },
  { key: "b", title: "研究表格型", note: "高密度横向比较，适合审计指标与快速换行研究。", accent: "#9c5b16" },
  { key: "c", title: "四象限地图型", note: "用趋势与稳定性发现拥挤、脆弱和反转候选。", accent: "#236c94" }
];

export default function DemoIndexPage() {
  return (
    <main className={styles.landing}>
      <header>
        <p>RegimeAlpha / Design Study</p>
        <h1>行业与主题下钻 · 三种方案</h1>
        <span>同一份真实数据，三种研究路径。选择一个版本进入。</span>
      </header>
      <div className={styles.landingGrid}>
        {demos.map((demo) => (
          <a key={demo.key} href={`/demos/${demo.key}/`} style={{ "--demo-accent": demo.accent }}>
            <b>{demo.key.toUpperCase()}</b>
            <h2>{demo.title}</h2>
            <p>{demo.note}</p>
            <span>打开线上 Demo →</span>
          </a>
        ))}
      </div>
      <a className={styles.backLink} href="/">返回 RegimeAlpha 主页面</a>
    </main>
  );
}
