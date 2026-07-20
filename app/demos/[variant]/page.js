import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import RegimeDemoSuite from "../RegimeDemoSuite";

const VARIANTS = new Set(["a", "b", "c"]);

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
  return JSON.parse(await readFile(file, "utf8"));
}

export default async function DemoVariantPage({ params }) {
  const { variant } = await params;
  if (!VARIANTS.has(variant)) notFound();

  return <RegimeDemoSuite initialData={await loadRegimeData()} variant={variant} />;
}
