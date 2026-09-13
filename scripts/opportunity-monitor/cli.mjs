import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";
import { translator } from "./i18n.mjs";
import { Store } from "./store.mjs";
import { loadConfig } from "./config.mjs";
import { createAnalyzer, createGitHubClient } from "./clients.mjs";
import { renderBriefs, runCycle } from "./monitor.mjs";

async function main() {
  const { values } = parseArgs({
    options: {
      config: { type: "string" },
      lang: { type: "string", default: "en" },
      db: { type: "string", default: "monitor.local/opportunities.sqlite" },
      watch: { type: "boolean" },
      "history-days": { type: "string" },
      list: { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (!["en", "zh-CN"].includes(values.lang)) throw new Error("--lang must be en or zh-CN.");
  const t = translator(values.lang);
  if (values.help) {
    console.log(t("help"));
    return;
  }
  const historyDays = values["history-days"] === undefined ? 0 : Number(values["history-days"]);
  if (
    (values["history-days"] !== undefined &&
      (!Number.isInteger(historyDays) || historyDays < 1 || historyDays > 90)) ||
    (values.watch && historyDays) ||
    (values.list && (values.watch || historyDays))
  )
    throw new Error("Invalid combination of --watch, --list or --history-days (1–90).");
  const config = values.list
    ? null
    : await loadConfig(values.config ?? "monitor.local/config.json");
  const stop = new AbortController();
  const analyzer = values.list ? null : createAnalyzer(process.env, { signal: stop.signal });
  const github = values.list
    ? null
    : createGitHubClient(process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN, { signal: stop.signal });
  const path = resolve(values.db);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const store = new Store(path);
  const onStop = () => stop.abort();
  process.once("SIGINT", onStop);
  process.once("SIGTERM", onStop);
  try {
    if (values.list) {
      const records = store.results();
      console.log(
        values.json ? JSON.stringify(records, null, 2) : renderBriefs(records, values.lang)
      );
      return;
    }
    do {
      const result = await store.exclusive(() =>
        runCycle({ store, github, analyzer, config, historyDays, signal: stop.signal })
      );
      console.log(values.json ? JSON.stringify(result) : renderBriefs(result.changed, values.lang));
      for (const message of result.errors) console.error(message);
      if (!values.watch) {
        if (result.errors.length) process.exitCode = 1;
        break;
      }
      if (stop.signal.aborted) break;
      const delay = Math.max(
        config.intervalSeconds * 1000,
        (store.get("cooldown") ?? 0) - Date.now()
      );
      try {
        await sleep(delay, undefined, { signal: stop.signal });
      } catch {
        break;
      }
    } while (!stop.signal.aborted);
  } finally {
    store.close();
    process.removeListener("SIGINT", onStop);
    process.removeListener("SIGTERM", onStop);
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
