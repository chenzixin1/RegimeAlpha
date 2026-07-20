import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import RegimeDemoSuite from "../RegimeDemoSuite";

const VARIANTS = new Set(["a", "b", "c"]);
const SCORE_METRICS = [
  "close",
  "weeklyReturn",
  "ret4w",
  "ret13w",
  "ret26w",
  "relativeToSpy13w",
  "trendEfficiency20",
  "realizedVol20",
  "drawdown52w",
  "aboveMa50",
  "aboveMa200"
];

export const dynamic = "force-static";

export function generateStaticParams() {
  return [...VARIANTS].map((variant) => ({ variant }));
}

export async function generateMetadata({ params }) {
  const { variant } = await params;
  const names = {
    a: "排名卡片型",
    b: "研究表格型",
    c: "四象限地图型"
  };
  return {
    title: `RegimeAlpha Demo ${variant?.toUpperCase()} · ${names[variant] || ""}`
  };
}

async function loadRegimeData() {
  const file = path.join(process.cwd(), "data", "regimes.json");
  const data = JSON.parse(await readFile(file, "utf8"));

  return {
    metadata: { dataThrough: data.metadata.dataThrough },
    summary: { latest: { weekEnd: data.summary.latest.weekEnd } },
    regimes: data.regimes.slice(-9).map(({ weekEnd }) => ({ weekEnd })),
    assetRegimes: data.assetRegimes.map((asset) => ({
      symbol: asset.symbol,
      displaySymbol: asset.displaySymbol,
      name: asset.name,
      group: asset.group,
      regimes: asset.regimes.map((row, index) => compactRow(row, index >= asset.regimes.length - 9))
    }))
  };
}

function compactRow(row, includeScores) {
  const compact = {
    weekEnd: row.weekEnd,
    code: row.code,
    labelZh: row.labelZh,
    metrics: { close: row.metrics?.close }
  };

  if (!includeScores) return compact;

  compact.confidence = row.confidence;
  compact.transition = { pressure: row.transition?.pressure };
  compact.drivers = row.drivers?.slice(0, 3) || [];
  compact.metrics = Object.fromEntries(SCORE_METRICS.map((key) => [key, row.metrics?.[key]]));
  return compact;
}

export default async function DemoVariantPage({ params }) {
  const { variant } = await params;
  if (!VARIANTS.has(variant)) notFound();

  return <RegimeDemoSuite initialData={await loadRegimeData()} variant={variant} />;
}
