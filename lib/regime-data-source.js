const DEFAULT_DATA_URL = "https://regimealpha.chenzixin.uk/data/regimes.json";

export async function loadRegimeDataFromService(env, requestUrl = DEFAULT_DATA_URL) {
  if (!env?.REGIME_DATA_SERVICE || typeof env.REGIME_DATA_SERVICE.fetch !== "function") {
    throw new Error("REGIME_DATA_SERVICE is not configured.");
  }

  const url = new URL("/data/regimes.json", requestUrl);
  const response = await env.REGIME_DATA_SERVICE.fetch(new Request(url, {
    headers: { accept: "application/json" }
  }));
  if (!response.ok) {
    throw new Error(`RegimeAlpha data service failed: ${response.status}`);
  }

  const data = await response.json();
  const dataThrough = data?.metadata?.dataThrough;
  const latestWeek = data?.summary?.latest?.weekEnd;
  if (!dataThrough || !latestWeek) {
    throw new Error("RegimeAlpha data service returned an incomplete snapshot.");
  }
  if (dataThrough !== latestWeek) {
    throw new Error("RegimeAlpha data service returned an inconsistent snapshot.");
  }
  return data;
}
