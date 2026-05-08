import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-static";

export async function GET() {
  const file = path.join(process.cwd(), "data", "regimes.json");
  const raw = await readFile(file, "utf8");
  return Response.json(JSON.parse(raw), {
    headers: {
      "cache-control": "public, max-age=300, stale-while-revalidate=3600"
    }
  });
}
