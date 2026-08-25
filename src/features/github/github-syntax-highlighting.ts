export type SupportedSyntaxLanguage =
  | "astro"
  | "c"
  | "cmake"
  | "cpp"
  | "csharp"
  | "css"
  | "dart"
  | "dockerfile"
  | "elixir"
  | "erlang"
  | "go"
  | "graphql"
  | "haskell"
  | "hcl"
  | "html"
  | "java"
  | "javascript"
  | "json"
  | "jsonc"
  | "jsx"
  | "kotlin"
  | "less"
  | "lua"
  | "make"
  | "markdown"
  | "mdx"
  | "nix"
  | "perl"
  | "php"
  | "powershell"
  | "proto"
  | "python"
  | "r"
  | "ruby"
  | "rust"
  | "scala"
  | "scss"
  | "shellscript"
  | "solidity"
  | "sql"
  | "svelte"
  | "swift"
  | "toml"
  | "tsx"
  | "typescript"
  | "vue"
  | "xml"
  | "yaml"
  | "zig";

export type SyntaxLanguage = SupportedSyntaxLanguage | "text";
export type SyntaxColorMode = "dark" | "light";

export type HighlightedToken = {
  color?: string;
  content: string;
  fontStyle?: number;
};

export type HighlightedSource = {
  language: SupportedSyntaxLanguage;
  lines: HighlightedToken[][];
};

export type SyntaxHighlightWorkerRequest = {
  requestId: number;
  source: string;
  language: SupportedSyntaxLanguage;
  colorMode: SyntaxColorMode;
};

export type SyntaxHighlightWorkerResponse = {
  requestId: number;
  lines: HighlightedToken[][] | null;
};

const MAX_HIGHLIGHT_BYTES = 500_000;
const MAX_HIGHLIGHT_LINES = 5_000;

const LANGUAGE_BY_EXTENSION: Record<string, SyntaxLanguage> = {
  astro: "astro",
  bash: "shellscript",
  c: "c",
  cc: "cpp",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  cts: "typescript",
  cxx: "cpp",
  dart: "dart",
  ex: "elixir",
  exs: "elixir",
  go: "go",
  gql: "graphql",
  graphql: "graphql",
  h: "c",
  hcl: "hcl",
  hpp: "cpp",
  hrl: "erlang",
  hs: "haskell",
  htm: "html",
  html: "html",
  hxx: "cpp",
  java: "java",
  js: "javascript",
  json: "json",
  jsonc: "jsonc",
  jsx: "jsx",
  kt: "kotlin",
  kts: "kotlin",
  less: "less",
  lua: "lua",
  md: "markdown",
  mdx: "mdx",
  mjs: "javascript",
  mts: "typescript",
  nix: "nix",
  php: "php",
  pl: "perl",
  pm: "perl",
  proto: "proto",
  ps1: "powershell",
  py: "python",
  pyw: "python",
  r: "r",
  rb: "ruby",
  rs: "rust",
  scala: "scala",
  scss: "scss",
  sh: "shellscript",
  sol: "solidity",
  sql: "sql",
  svelte: "svelte",
  swift: "swift",
  tf: "hcl",
  ts: "typescript",
  toml: "toml",
  tsx: "tsx",
  vue: "vue",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zig: "zig",
  zsh: "shellscript",
};

const LANGUAGE_BY_FILENAME: Record<string, SyntaxLanguage> = {
  "cmakelists.txt": "cmake",
  dockerfile: "dockerfile",
  makefile: "make",
};

export function detectSyntaxLanguage(fileName: string): SyntaxLanguage {
  const normalizedName = fileName.toLowerCase();
  const baseName = normalizedName.split("/").pop() || normalizedName;
  const byName = LANGUAGE_BY_FILENAME[baseName];
  if (byName) return byName;

  const extension = baseName.includes(".") ? baseName.split(".").pop() : null;
  return (extension && LANGUAGE_BY_EXTENSION[extension]) || "text";
}

export async function highlightSourceCode({
  source,
  fileName,
  colorMode,
  size,
}: {
  source: string;
  fileName: string;
  colorMode: SyntaxColorMode;
  size: number;
}): Promise<HighlightedSource | null> {
  const language = detectSyntaxLanguage(fileName);
  if (
    language === "text" ||
    size > MAX_HIGHLIGHT_BYTES ||
    source.split("\n", MAX_HIGHLIGHT_LINES + 1).length > MAX_HIGHLIGHT_LINES
  ) {
    return null;
  }

  const { requestSyntaxHighlighting } = await import("./github-syntax-highlighting-worker-client");
  const lines = await requestSyntaxHighlighting({ source, language, colorMode });
  if (!lines) return null;
  return { language, lines };
}
