import { resolveFmpConfig } from "../lib/fmp-client.js";
import { resolveMassiveConfig } from "../lib/massive-config.js";
import {
  generateRegimeData,
  loadLocalEnv,
  readPreviousPayload,
  writeGeneratedData
} from "./build-regimes.mjs";

loadLocalEnv([".env.local", ".env"]);

const incremental = process.env.REGIME_INCREMENTAL === "1";
const previousPayload = incremental
  ? readPreviousPayload(process.env.REGIME_PREVIOUS_PAYLOAD || "data/regimes.json")
  : null;

generateRegimeData({
  massiveConfig: resolveMassiveConfig(process.env),
  fmpConfig: resolveFmpConfig(process.env),
  asOf: process.env.AS_OF_DATE,
  previousPayload,
  incremental,
  refresh: process.env.REGIME_REFRESH === "1",
  outputStartDate: process.env.REGIME_OUTPUT_START_DATE,
  fetchStartDate: process.env.REGIME_FETCH_START_DATE,
  sqliteEnabled: process.env.REGIME_CACHE !== "off",
  sqliteBin: process.env.SQLITE_BIN,
  sqlitePath: process.env.REGIME_SQLITE_PATH,
  onProgress: console.log
})
  .then((result) => writeGeneratedData({ ...result, onProgress: console.log }))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
