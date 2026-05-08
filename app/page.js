import { readFile } from "node:fs/promises";
import path from "node:path";
import RegimeDashboard from "./components/RegimeDashboard";

export const dynamic = "force-static";

async function loadRegimeData() {
  const file = path.join(process.cwd(), "data", "regimes.json");
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw);
}

export default async function Home() {
  const data = await loadRegimeData();
  return <RegimeDashboard initialData={data} />;
}
