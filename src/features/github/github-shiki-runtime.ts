import { createHighlighterCore, type HighlighterCore, type LanguageInput } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import type {
  HighlightedToken,
  SupportedSyntaxLanguage,
  SyntaxColorMode,
} from "./github-syntax-highlighting";

type LanguageModule = { default: LanguageInput };
type LanguageLoader = () => Promise<LanguageModule>;

const LANGUAGE_LOADER_RECORD = {
  astro: () => import("@shikijs/langs/astro"),
  c: () => import("@shikijs/langs/c"),
  cmake: () => import("@shikijs/langs/cmake"),
  cpp: () => import("@shikijs/langs/cpp"),
  csharp: () => import("@shikijs/langs/csharp"),
  css: () => import("@shikijs/langs/css"),
  dart: () => import("@shikijs/langs/dart"),
  dockerfile: () => import("@shikijs/langs/dockerfile"),
  elixir: () => import("@shikijs/langs/elixir"),
  erlang: () => import("@shikijs/langs/erlang"),
  go: () => import("@shikijs/langs/go"),
  graphql: () => import("@shikijs/langs/graphql"),
  haskell: () => import("@shikijs/langs/haskell"),
  hcl: () => import("@shikijs/langs/hcl"),
  html: () => import("@shikijs/langs/html"),
  java: () => import("@shikijs/langs/java"),
  javascript: () => import("@shikijs/langs/javascript"),
  json: () => import("@shikijs/langs/json"),
  jsonc: () => import("@shikijs/langs/jsonc"),
  jsx: () => import("@shikijs/langs/jsx"),
  kotlin: () => import("@shikijs/langs/kotlin"),
  less: () => import("@shikijs/langs/less"),
  lua: () => import("@shikijs/langs/lua"),
  make: () => import("@shikijs/langs/make"),
  markdown: () => import("@shikijs/langs/markdown"),
  mdx: () => import("@shikijs/langs/mdx"),
  nix: () => import("@shikijs/langs/nix"),
  perl: () => import("@shikijs/langs/perl"),
  php: () => import("@shikijs/langs/php"),
  powershell: () => import("@shikijs/langs/powershell"),
  proto: () => import("@shikijs/langs/proto"),
  python: () => import("@shikijs/langs/python"),
  r: () => import("@shikijs/langs/r"),
  ruby: () => import("@shikijs/langs/ruby"),
  rust: () => import("@shikijs/langs/rust"),
  scala: () => import("@shikijs/langs/scala"),
  scss: () => import("@shikijs/langs/scss"),
  shellscript: () => import("@shikijs/langs/shellscript"),
  solidity: () => import("@shikijs/langs/solidity"),
  sql: () => import("@shikijs/langs/sql"),
  svelte: () => import("@shikijs/langs/svelte"),
  swift: () => import("@shikijs/langs/swift"),
  toml: () => import("@shikijs/langs/toml"),
  tsx: () => import("@shikijs/langs/tsx"),
  typescript: () => import("@shikijs/langs/typescript"),
  vue: () => import("@shikijs/langs/vue"),
  xml: () => import("@shikijs/langs/xml"),
  yaml: () => import("@shikijs/langs/yaml"),
  zig: () => import("@shikijs/langs/zig"),
} satisfies Record<SupportedSyntaxLanguage, LanguageLoader>;
const LANGUAGE_LOADERS = new Map<SupportedSyntaxLanguage, LanguageLoader>(
  Object.entries(LANGUAGE_LOADER_RECORD) as [SupportedSyntaxLanguage, LanguageLoader][]
);

let highlighterPromise: Promise<HighlighterCore> | null = null;
const languageLoads = new Map<SupportedSyntaxLanguage, Promise<void>>();

function getHighlighter() {
  highlighterPromise ??= Promise.all([
    import("@shikijs/themes/one-dark-pro"),
    import("@shikijs/themes/github-light-default"),
  ]).then(([darkTheme, lightTheme]) =>
    createHighlighterCore({
      themes: [darkTheme.default, lightTheme.default],
      langs: [],
      engine: createJavaScriptRegexEngine(),
    })
  );
  return highlighterPromise;
}

function loadLanguage(highlighter: HighlighterCore, language: SupportedSyntaxLanguage) {
  let loading = languageLoads.get(language);
  if (!loading) {
    const loader = LANGUAGE_LOADERS.get(language);
    if (!loader) throw new Error(`Unsupported syntax language: ${language}`);
    loading = loader().then((module) => highlighter.loadLanguage(module.default));
    languageLoads.set(language, loading);
  }
  return loading;
}

export async function highlightWithShiki({
  source,
  language,
  colorMode,
}: {
  source: string;
  language: SupportedSyntaxLanguage;
  colorMode: SyntaxColorMode;
}): Promise<HighlightedToken[][]> {
  const highlighter = await getHighlighter();
  await loadLanguage(highlighter, language);
  const result = highlighter.codeToTokens(source, {
    lang: language,
    theme: colorMode === "light" ? "github-light-default" : "one-dark-pro",
    tokenizeMaxLineLength: 20_000,
    tokenizeTimeLimit: 100,
  });
  const lines = result.tokens.map((line) =>
    line.map(({ color, content, fontStyle }) => ({ color, content, fontStyle }))
  );
  if (source.endsWith("\n") && lines[lines.length - 1]?.length === 0) lines.pop();
  return lines;
}
