import { readFile } from "node:fs/promises";

export function validateConfig(input) {
  const keys = [
    "repositories",
    "preferences",
    "excludeLabels",
    "includeLabels",
    "intervalSeconds",
    "maxAnalyses",
  ];
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Config must be an object.");
  for (const key of Object.keys(input))
    if (!keys.includes(key)) throw new Error(`Unknown config field: ${key}`);
  if (
    !Array.isArray(input.repositories) ||
    !input.repositories.length ||
    input.repositories.length > 20
  )
    throw new Error("Configure 1–20 repositories.");
  const repositories = input.repositories.map((repo) => {
    if (
      typeof repo !== "string" ||
      !/^[\w.-]+\/[\w.-]+$/.test(repo) ||
      repo.split("/").some((s) => s === "." || s === "..")
    )
      throw new Error("Each repository must use owner/name format.");
    return repo.toLowerCase();
  });
  if (new Set(repositories).size !== repositories.length) throw new Error("Duplicate repository.");
  const preferences = input.preferences ?? "";
  if (typeof preferences !== "string" || preferences.length > 8000)
    throw new Error("preferences must be text of at most 8000 characters.");
  function labels(key) {
    const value = input[key] ?? [];
    if (
      !Array.isArray(value) ||
      value.length > 50 ||
      value.some((s) => typeof s !== "string" || !s.trim() || s.trim().length > 100)
    )
      throw new Error(`${key} must be a list of labels.`);
    return value.map((s) => s.trim().toLowerCase());
  }
  function integer(key, fallback, min, max) {
    const n = input[key] ?? fallback;
    if (!Number.isInteger(n) || n < min || n > max)
      throw new Error(`${key} must be ${min}–${max}.`);
    return n;
  }
  return {
    repositories,
    preferences,
    excludeLabels: labels("excludeLabels"),
    includeLabels: labels("includeLabels"),
    intervalSeconds: integer("intervalSeconds", 300, 60, 86400),
    maxAnalyses: integer("maxAnalyses", 10, 1, 100),
  };
}
export async function loadConfig(path) {
  return validateConfig(JSON.parse(await readFile(path, "utf8")));
}
