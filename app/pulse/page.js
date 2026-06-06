import { readFile } from "node:fs/promises";
import path from "node:path";
import PulseDashboard from "../components/PulseDashboard";

export const dynamic = "force-static";

async function loadPulseAnchor() {
  const file = path.join(process.cwd(), "data", "regimes.json");
  const raw = await readFile(file, "utf8");
  const data = JSON.parse(raw);

  return {
    metadata: data.metadata,
    latest: data.summary.latest,
    latestAssets: data.summary.assets?.latest || [],
    regimeDefinitions: data.regimeDefinitions
  };
}

export default async function PulsePage() {
  const anchor = await loadPulseAnchor();
  return <PulseDashboard anchor={anchor} />;
}
