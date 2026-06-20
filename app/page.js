import { readFile } from "node:fs/promises";
import path from "node:path";
import RegimeDashboard from "./components/RegimeDashboard";

export const dynamic = "force-static";

async function loadRegimeData() {
  const file = path.join(process.cwd(), "data", "regimes.json");
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw);
}

async function loadPreviewCandles() {
  const file = path.join(process.cwd(), "public", "local-preview-candles.json");
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw);
}

export default async function Home() {
  const data = await loadRegimeData();
  const previewCandles = await loadPreviewCandles();
  return (
    <RegimeDashboard
      initialData={data}
      initialPreviewCandles={previewCandles}
      previewConfig={{
        showAssetWeekCandle: true,
        candleDataUrl: "/local-preview-candles.json",
        syncSelectedWeekToLatest: true
      }}
    />
  );
}
