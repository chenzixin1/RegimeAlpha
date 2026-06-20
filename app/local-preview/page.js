import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import RegimeDashboard from "../components/RegimeDashboard";

export const dynamic = "force-static";

async function loadRegimeData() {
  try {
    const raw = execFileSync("git", ["show", "origin/main:data/regimes.json"], {
      cwd: process.cwd(),
      encoding: "utf8"
    });
    return JSON.parse(raw);
  } catch {}

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch("https://regimealpha.chenzixin.uk/data/regimes.json", {
      cache: "no-store",
      signal: controller.signal
    });
    if (response.ok) {
      return response.json();
    }
  } catch {}
  finally {
    clearTimeout(timeout);
  }

  const file = path.join(process.cwd(), "data", "regimes.json");
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw);
}

async function loadPreviewCandles() {
  const file = path.join(process.cwd(), "public", "local-preview-candles.json");
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw);
}

export default async function LocalPreviewPage() {
  const data = await loadRegimeData();
  const previewCandles = await loadPreviewCandles();
  return (
    <RegimeDashboard
      initialData={data}
      initialPreviewCandles={previewCandles}
      previewConfig={{
        label: "本地副本 · 卡片加入本周 K 线",
        showAssetWeekCandle: true,
        disableDataRefresh: true,
        syncSelectedWeekToLatest: true,
        refreshDataUrl: "https://regimealpha.chenzixin.uk/data/regimes.json"
      }}
    />
  );
}
