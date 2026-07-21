import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import RegimeDashboard from "../../components/RegimeDashboard";

const VARIANTS = new Set(["a", "b", "c"]);
const VARIANT_NAMES = {
  a: "Regime 排序卡片版",
  b: "Regime 研究表格版",
  c: "Regime 强弱地图版"
};

export const dynamic = "force-static";

export function generateStaticParams() {
  return [...VARIANTS].map((variant) => ({ variant }));
}

export async function generateMetadata({ params }) {
  const { variant } = await params;
  return {
    title: `RegimeAlpha ${variant?.toUpperCase()} · ${VARIANT_NAMES[variant] || ""}`
  };
}

async function loadRegimeData() {
  return JSON.parse(await readFile(path.join(process.cwd(), "data", "regimes.json"), "utf8"));
}

async function loadPreviewCandles() {
  return JSON.parse(await readFile(path.join(process.cwd(), "public", "local-preview-candles.json"), "utf8"));
}

export default async function DemoVariantPage({ params }) {
  const { variant } = await params;
  if (!VARIANTS.has(variant)) notFound();

  const [data, previewCandles] = await Promise.all([
    loadRegimeData(),
    loadPreviewCandles()
  ]);

  return (
    <RegimeDashboard
      initialData={data}
      initialPreviewCandles={previewCandles}
      industryVariant={variant}
      previewConfig={{
        label: `完整方案 ${variant.toUpperCase()} · ${VARIANT_NAMES[variant]}`,
        showAssetWeekCandle: true,
        disableDataRefresh: true,
        syncSelectedWeekToLatest: true
      }}
    />
  );
}
