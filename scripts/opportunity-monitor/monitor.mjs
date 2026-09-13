import { translator } from "./i18n.mjs";
import { createHash } from "node:crypto";

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalize(issue) {
  if (
    !Number.isSafeInteger(issue.number) ||
    typeof issue.title !== "string" ||
    !["open", "closed"].includes(issue.state) ||
    !Number.isFinite(Date.parse(issue.created_at)) ||
    !Number.isFinite(Date.parse(issue.updated_at))
  )
    throw new Error("GitHub returned an invalid issue.");
  return {
    number: issue.number,
    title: issue.title,
    body: issue.body ?? "",
    state: issue.state,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    locked: !!issue.locked,
    labels: (issue.labels ?? []).map((l) => (typeof l === "string" ? l : l.name)),
    assignees: (issue.assignees ?? []).map((a) => (typeof a === "string" ? a : a.login)),
    comments: issue.comments ?? 0,
  };
}

export function filterIssue(issue, config) {
  if (issue.state !== "open") return "Issue is closed.";
  if (issue.locked) return "Discussion is locked.";
  if (issue.assignees.length) return "Issue already has an assignee.";
  const labels = issue.labels.map((s) => s.toLowerCase());
  if (config.excludeLabels.some((l) => labels.includes(l))) return "Excluded label.";
  if (config.includeLabels.length && !config.includeLabels.some((l) => labels.includes(l)))
    return "No configured inclusion label.";
  return null;
}

export async function runCycle({
  store,
  github,
  analyzer,
  config,
  historyDays = 0,
  signal,
  now = () => new Date().toISOString(),
}) {
  const started = now();
  const errors = [];
  const changed = [];
  let analyzed = 0;
  if ((store.get("cooldown") ?? 0) > Date.parse(started))
    return { changed, errors: ["API cooldown is active."], analyzed };
  const policy = {
    preferences: config.preferences,
    includeLabels: config.includeLabels,
    excludeLabels: config.excludeLabels,
    analyzer: analyzer.identity,
  };
  const policyHash = digest(policy);
  // Changing preferences requeues stored candidates without silently importing old issues.
  if (store.get("policy") !== policyHash) {
    store.requeue();
    store.set("policy", policyHash);
  }
  for (const repo of config.repositories) {
    if (signal?.aborted) break;
    const checkpoint = store.get(`repo:${repo}`) ?? { baseline: started, cursor: started };
    store.set(`repo:${repo}`, checkpoint);
    const since = new Date(
      (historyDays ? Date.parse(started) - historyDays * 86400000 : Date.parse(checkpoint.cursor)) -
        60000
    ).toISOString();
    try {
      const items = await github.issues(repo, since);
      // Prepare the full page set before moving the cursor; failures must not lose unseen issues.
      const issues = items
        .filter((i) => !i.pull_request)
        .map(normalize)
        .filter(
          (i) =>
            Date.parse(i.created_at) >=
              (historyDays
                ? Date.parse(started) - historyDays * 86400000
                : Date.parse(checkpoint.baseline)) || store.hasIssue(repo, i.number)
        );
      for (const issue of issues) store.observe(repo, issue, digest({ issue, policy }));
      store.set(`repo:${repo}`, {
        ...checkpoint,
        cursor: historyDays ? checkpoint.cursor : started,
      });
    } catch (error) {
      errors.push(`${repo}: ${error.message}`);
      if (error.retryAt) {
        store.set("cooldown", error.retryAt);
        break;
      }
    }
  }
  if ((store.get("cooldown") ?? 0) > Date.now()) return { changed, errors, analyzed };
  for (const row of store.pending(config.repositories, config.maxAnalyses)) {
    if (signal?.aborted) break;
    try {
      let issue = JSON.parse(row.payload);
      let reason = filterIssue(issue, config);
      if (!reason) {
        const context = await github.context(row.repo, row.number);
        issue = normalize(context.issue);
        store.observe(row.repo, issue, digest({ issue, policy }));
        reason = filterIssue(issue, config);
        if (!reason) {
          const result = await analyzer.analyze(
            { repository: row.repo, issue, comments: context.comments },
            config.preferences
          );
          analyzed++;
          const record = {
            ...result,
            analysisSource: "model",
            availability: "unverified",
            scope:
              "Issue and comments only; contribution rules, linked PRs and source code require manual checks.",
          };
          store.finish(row.repo, row.number, result.decision, record, now());
          if (result.decision !== "skip")
            changed.push({
              repo: row.repo,
              number: row.number,
              issue,
              checkedAt: now(),
              ...record,
            });
          continue;
        }
      }
      store.finish(
        row.repo,
        row.number,
        "skip",
        { decision: "skip", summary: reason, analysisSource: "rules" },
        now()
      );
    } catch (error) {
      store.fail(row.repo, row.number, error.message, now());
      errors.push(`${row.repo}#${row.number}: ${error.message}`);
      if (error.retryAt) {
        store.set("cooldown", error.retryAt);
        break;
      }
    }
  }
  return { changed, errors, analyzed };
}

// Strip terminal controls from repository and model text before displaying it.
function safe(value) {
  return String(value).replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "");
}
export function renderBriefs(records, language = "en") {
  const t = translator(language);
  if (!records.length) return t("empty") + "\n";
  return records
    .map((r) =>
      [
        `# ${r.repo}#${r.number}: ${safe(r.issue.title)}`,
        `https://github.com/${r.repo}/issues/${r.number}`,
        t("decision", { decision: t(r.decision), time: r.checkedAt }),
        safe(r.summary),
        t("reasons"),
        ...r.reasons.map((s) => `- ${safe(s)}`),
        t("uncertainties"),
        ...r.uncertainties.map((s) => `- ${safe(s)}`),
        t("scope"),
        t("firstStep", { step: safe(r.firstStep) }),
        t("draft"),
        safe(r.claimDraft),
        "",
      ].join("\n\n")
    )
    .join("\n");
}
