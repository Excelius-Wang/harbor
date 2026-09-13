// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Store } from "./store.mjs";
import { validateConfig } from "./config.mjs";
import { runCycle, renderBriefs } from "./monitor.mjs";
import { createAnalyzer, createGitHubClient, requestJson, RequestError } from "./clients.mjs";

const roots = [];
const stores = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const initial = "2026-09-13T10:00:00.000Z";
const later = "2026-09-13T11:00:00.000Z";
function issue(number = 1, overrides = {}) {
  return {
    number,
    title: "Keyboard focus disappears",
    body: "Reproduce by closing the dialog.",
    state: "open",
    created_at: "2026-09-13T10:30:00.000Z",
    updated_at: "2026-09-13T10:30:00.000Z",
    labels: [],
    assignees: [],
    comments: 0,
    ...overrides,
  };
}
const assessment = {
  decision: "recommend",
  summary: "Investigate focus restoration.",
  reasons: ["Matches UI preference."],
  uncertainties: ["Availability unknown."],
  firstStep: "Reproduce.",
  claimDraft: "May I investigate this issue?",
};
function fixture(extra = {}) {
  const root = mkdtempSync(join(tmpdir(), "harbor-monitor-"));
  roots.push(root);
  const store = new Store(join(root, "state.sqlite"));
  stores.push(store);
  const config = validateConfig({ repositories: ["acme/widget"], ...extra });
  const github = {
    issues: vi.fn().mockResolvedValue([]),
    context: vi
      .fn()
      .mockImplementation(async (_, number) => ({ issue: issue(number), comments: [] })),
  };
  const analyzer = { identity: "test", analyze: vi.fn().mockResolvedValue(assessment) };
  const run = (time = later, options = {}) =>
    store.exclusive(() =>
      runCycle({ store, config, github, analyzer, now: () => time, ...options })
    );
  return { root, store, config, github, analyzer, run };
}

describe("durable monitoring", () => {
  it("baselines old issues, catches new issues, and does not repeat on overlapping checks or reopening the database", async () => {
    const f = fixture();
    f.github.issues.mockResolvedValue([issue(9, { created_at: "2026-09-01T00:00:00Z" })]);
    expect((await f.run(initial)).changed).toEqual([]);
    f.github.issues.mockResolvedValue([issue(), issue(2, { pull_request: {} })]);
    expect((await f.run()).changed).toHaveLength(1);
    const reopened = new Store(join(f.root, "state.sqlite"));
    stores.push(reopened);
    expect(reopened.results()).toHaveLength(1);
    expect((await f.run()).changed).toEqual([]);
    expect(f.analyzer.analyze).toHaveBeenCalledTimes(1);
    expect(f.github.issues.mock.calls[1][1]).toBe("2026-09-13T09:59:00.000Z");
  });
  it("does not advance cursor when pagination fails, and continues other repositories", async () => {
    const f = fixture({ repositories: ["acme/widget", "acme/other"] });
    await f.run(initial);
    f.github.issues.mockImplementation(async (repo) => {
      if (repo.endsWith("widget")) throw new Error("Page 2 failed");
      return [issue()];
    });
    const result = await f.run();
    expect(result.errors).toHaveLength(1);
    expect(result.changed[0].repo).toBe("acme/other");
    expect(f.store.get("repo:acme/widget").cursor).toBe(initial);
  });
  it("keeps failed analysis pending beyond the cursor and retries when the next poll is empty", async () => {
    const f = fixture();
    await f.run(initial);
    f.github.issues.mockResolvedValue([issue()]);
    f.analyzer.analyze.mockRejectedValueOnce(new Error("Model unavailable"));
    expect((await f.run()).errors).toHaveLength(1);
    f.github.issues.mockResolvedValue([]);
    expect((await f.run("2026-09-13T12:00:00Z")).changed).toHaveLength(1);
  });
  it("rechecks current assignment before model analysis and retracts saved recommendations on closure", async () => {
    const f = fixture();
    await f.run(initial);
    f.github.issues.mockResolvedValue([issue()]);
    f.github.context.mockResolvedValueOnce({
      issue: issue(1, { assignees: [{ login: "someone" }] }),
      comments: [],
    });
    expect((await f.run()).changed).toEqual([]);
    expect(f.analyzer.analyze).not.toHaveBeenCalled();
    await f.run();
    expect(f.store.results()).toHaveLength(1);
    f.github.issues.mockResolvedValue([issue(1, { state: "closed", updated_at: later })]);
    await f.run();
    expect(f.store.results()).toHaveLength(0);
  });
  it("allows bounded historical screening and drains capped analysis over later cycles", async () => {
    const f = fixture({ maxAnalyses: 1 });
    f.github.issues.mockResolvedValue([issue(1, { created_at: "2026-09-12T00:00:00Z" }), issue(2)]);
    expect((await f.run(later, { historyDays: 7 })).changed).toHaveLength(1);
    f.github.issues.mockResolvedValue([]);
    expect((await f.run()).changed).toHaveLength(1);
    expect(f.store.results()).toHaveLength(2);
  });
  it("requeues unchanged candidates when preferences change", async () => {
    const f = fixture();
    await f.run(initial);
    f.github.issues.mockResolvedValue([issue()]);
    await f.run();
    f.config.preferences = "Prefer backend issues";
    await f.run();
    expect(f.analyzer.analyze).toHaveBeenCalledTimes(2);
  });
  it("serializes runners and rolls back unexpected failures", async () => {
    const f = fixture();
    const second = new Store(join(f.root, "state.sqlite"));
    stores.push(second);
    await f.store.exclusive(async () => {
      await expect(second.exclusive(async () => {})).rejects.toThrow("Another monitor");
    });
    await expect(
      f.store.exclusive(async () => {
        f.store.set("uncommitted", true);
        throw new Error("crash");
      })
    ).rejects.toThrow("crash");
    expect(f.store.get("uncommitted")).toBeNull();
  });
  it("persists API cooldown without advancing failed repository progress", async () => {
    const f = fixture();
    await f.run(initial);
    const retryAt = Date.now() + 3600000;
    f.github.issues.mockRejectedValue(new RequestError("GitHub", 429, retryAt));
    await f.run();
    expect(f.store.get("cooldown")).toBe(retryAt);
    expect(f.store.get("repo:acme/widget").cursor).toBe(initial);
    f.github.issues.mockClear();
    await f.run(new Date().toISOString());
    expect(f.github.issues).not.toHaveBeenCalled();
  });
});

describe("HTTP boundaries", () => {
  it("follows all pages with GET only and rejects foreign pagination hosts", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([issue()]), {
          headers: { link: '<https://api.github.com/repos/acme/widget/issues?page=2>; rel="next"' },
        })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([issue(2)])));
    const client = createGitHubClient("secret", { fetchImpl });
    expect(await client.issues("acme/widget", initial)).toHaveLength(2);
    expect(fetchImpl.mock.calls.every(([, options]) => !options.method)).toBe(true);
    fetchImpl.mockResolvedValueOnce(
      new Response("[]", { headers: { link: '<https://attacker.example/repos/a/b>; rel="next"' } })
    );
    await expect(client.issues("acme/widget", initial)).rejects.toThrow("pagination URL");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it("retries transient reads, observes rate resets and never exposes response bodies", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("secret response", { status: 503 }))
      .mockResolvedValueOnce(new Response("[]"));
    const sleepImpl = vi.fn();
    await requestJson("https://api.github.com", {}, { fetchImpl, sleepImpl });
    expect(sleepImpl).toHaveBeenCalledWith(1000, undefined, { signal: undefined });
    fetchImpl.mockResolvedValue(
      new Response("private secret", { status: 429, headers: { "retry-after": "120" } })
    );
    await expect(requestJson("https://api.github.com", {}, { fetchImpl })).rejects.toMatchObject({
      retryAt: expect.any(Number),
    });
    fetchImpl.mockResolvedValue(new Response("private secret", { status: 401 }));
    await expect(requestJson("https://api.github.com", {}, { fetchImpl })).rejects.toThrow(
      "API: HTTP 401"
    );
  });
  it("validates model output, uses configured endpoint and does not enable tools", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: "stop", message: { content: JSON.stringify(assessment) } }],
        })
      )
    );
    const analyzer = createAnalyzer(
      {
        MONITOR_AI_API_KEY: "secret",
        MONITOR_AI_MODEL: "configured-model",
        MONITOR_AI_BASE_URL: "https://model.example/v1",
      },
      { fetchImpl }
    );
    expect(await analyzer.analyze({ issue: issue(), comments: [] }, "React")).toEqual(assessment);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url.href).toBe("https://model.example/v1/chat/completions");
    expect(JSON.parse(options.body).tools).toBeUndefined();
    expect(JSON.parse(options.body).model).toBe("configured-model");
    fetchImpl.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: "stop", message: { content: '{"decision":"recommend"}' } }],
        })
      )
    );
    await expect(analyzer.analyze({}, "")).rejects.toThrow("schema");
  });
});

describe("configuration and delivery", () => {
  it("rejects duplicate repositories, misspelled settings and invalid cadence", () => {
    expect(() => validateConfig({ repositories: ["a/b", "A/B"] })).toThrow("Duplicate");
    expect(() => validateConfig({ repositories: ["a/b"], intervalSeconds: 0 })).toThrow(
      "intervalSeconds"
    );
    expect(() => validateConfig({ repositories: ["a/b"], automaticClaim: true })).toThrow(
      "Unknown"
    );
  });
  it("prints safe drafts with explicit evidence limits and never claims assignment", () => {
    const text = renderBriefs([
      {
        repo: "acme/widget",
        number: 1,
        issue: issue(1, { title: "\u001b[2Jtitle" }),
        checkedAt: later,
        scope: "No source analysis",
        ...assessment,
      },
    ]);
    expect(text).not.toContain("\u001b");
    expect(text).toContain("Availability: unverified");
    expect(text).toContain("not sent");
  });
  it("supports offline help and listing without credentials", () => {
    const f = fixture();
    const env = { PATH: process.env.PATH };
    const help = spawnSync(process.execPath, ["scripts/opportunity-monitor/cli.mjs", "--help"], {
      encoding: "utf8",
      env,
    });
    expect(help.status).toBe(0);
    const list = spawnSync(
      process.execPath,
      [
        "scripts/opportunity-monitor/cli.mjs",
        "--list",
        "--json",
        "--db",
        join(f.root, "state.sqlite"),
      ],
      { encoding: "utf8", env }
    );
    expect(list.status).toBe(0);
    expect(JSON.parse(list.stdout)).toEqual([]);
  });
});

it("preserves the original baseline across a first-run outage", async () => {
  const f = fixture();
  f.github.issues.mockRejectedValueOnce(new Error("offline"));
  await f.run(initial);
  f.github.issues.mockResolvedValue([issue()]);
  expect((await f.run()).changed).toHaveLength(1);
});

it("renders matching Chinese brief labels through i18next", () => {
  const text = renderBriefs(
    [{ repo: "acme/widget", number: 1, issue: issue(), checkedAt: later, ...assessment }],
    "zh-CN"
  );
  expect(text).toContain("认领状态：未核实");
  expect(text).toContain("尚未发送");
});

it("stops cancelled requests without retrying", async () => {
  const controller = new AbortController();
  controller.abort();
  const fetchImpl = vi.fn().mockRejectedValue(new Error("cancelled"));
  const sleepImpl = vi.fn();
  await expect(
    requestJson("https://api.github.com", {}, { fetchImpl, sleepImpl, signal: controller.signal })
  ).rejects.toThrow("cancelled");
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(sleepImpl).not.toHaveBeenCalled();
});

it("runs the real CLI with mocked HTTP, persists a brief and does not repeat the model call", () => {
  const f = fixture();
  const preload = join(f.root, "http.mjs");
  const configPath = join(f.root, "config.json");
  const database = join(f.root, "cli.sqlite");
  const modelCalls = join(f.root, "model-calls");
  writeFileSync(configPath, JSON.stringify({ repositories: ["acme/widget"] }));
  const payload = issue(7, {
    created_at: new Date(Date.now() - 3600000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  writeFileSync(
    preload,
    `
    import { appendFileSync } from 'node:fs';
    globalThis.fetch = async (input, options) => {
      const url = new URL(input);
      if (url.origin === 'https://api.github.com') {
        if (options.method && options.method !== 'GET') throw new Error('GitHub write prohibited');
        if (url.pathname.endsWith('/comments')) return Response.json([]);
        return Response.json(url.pathname.endsWith('/issues/7') ? ${JSON.stringify(payload)} : [${JSON.stringify(payload)}]);
      }
      if (url.href === 'https://model.example/v1/chat/completions') {
        appendFileSync(${JSON.stringify(modelCalls)}, 'call\\n');
        return Response.json({ choices: [{ finish_reason: 'stop', message: { content: ${JSON.stringify(JSON.stringify(assessment))} } }] });
      }
      throw new Error('Unexpected network destination');
    };
  `
  );
  const env = {
    PATH: process.env.PATH,
    GH_TOKEN: "fixture-token",
    MONITOR_AI_API_KEY: "fixture-key",
    MONITOR_AI_MODEL: "fixture",
    MONITOR_AI_BASE_URL: "https://model.example/v1",
  };
  const args = [
    "--import",
    preload,
    "scripts/opportunity-monitor/cli.mjs",
    "--config",
    configPath,
    "--db",
    database,
    "--history-days",
    "7",
    "--json",
  ];
  const first = spawnSync(process.execPath, args, { encoding: "utf8", env });
  expect(first.status, first.stderr).toBe(0);
  expect(JSON.parse(first.stdout).changed[0].claimDraft).toBe(assessment.claimDraft);
  const second = spawnSync(process.execPath, args, { encoding: "utf8", env });
  expect(second.status, second.stderr).toBe(0);
  expect(JSON.parse(second.stdout).changed).toEqual([]);
  expect(readFileSync(modelCalls, "utf8")).toBe("call\n");
});

it("normalizes label whitespace and bounds label rules", () => {
  expect(
    validateConfig({ repositories: ["acme/widget"], includeLabels: [" Help Wanted "] })
      .includeLabels
  ).toEqual(["help wanted"]);
  for (const includeLabels of [[" "], ["x".repeat(101)], Array(51).fill("bug")]) {
    expect(() => validateConfig({ repositories: ["acme/widget"], includeLabels })).toThrow();
  }
});
