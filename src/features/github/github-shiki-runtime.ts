import { createHighlighterCore, type HighlighterCore, type LanguageInput } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import type {
  HighlightedToken,
  SupportedSyntaxLanguage,
  SyntaxColorMode,
} from "./github-syntax-highlighting";

type LanguageModule = { default: LanguageInput };

function loadLanguageModule(language: SupportedSyntaxLanguage): Promise<LanguageModule> {
  switch (language) {
    case "astro":
      return import("@shikijs/langs/astro");
    case "c":
      return import("@shikijs/langs/c");
    case "cmake":
      return import("@shikijs/langs/cmake");
    case "cpp":
      return import("@shikijs/langs/cpp");
    case "csharp":
      return import("@shikijs/langs/csharp");
    case "css":
      return import("@shikijs/langs/css");
    case "dart":
      return import("@shikijs/langs/dart");
    case "dockerfile":
      return import("@shikijs/langs/dockerfile");
    case "elixir":
      return import("@shikijs/langs/elixir");
    case "erlang":
      return import("@shikijs/langs/erlang");
    case "go":
      return import("@shikijs/langs/go");
    case "graphql":
      return import("@shikijs/langs/graphql");
    case "haskell":
      return import("@shikijs/langs/haskell");
    case "hcl":
      return import("@shikijs/langs/hcl");
    case "html":
      return import("@shikijs/langs/html");
    case "java":
      return import("@shikijs/langs/java");
    case "javascript":
      return import("@shikijs/langs/javascript");
    case "json":
      return import("@shikijs/langs/json");
    case "jsonc":
      return import("@shikijs/langs/jsonc");
    case "jsx":
      return import("@shikijs/langs/jsx");
    case "kotlin":
      return import("@shikijs/langs/kotlin");
    case "less":
      return import("@shikijs/langs/less");
    case "lua":
      return import("@shikijs/langs/lua");
    case "make":
      return import("@shikijs/langs/make");
    case "markdown":
      return import("@shikijs/langs/markdown");
    case "mdx":
      return import("@shikijs/langs/mdx");
    case "nix":
      return import("@shikijs/langs/nix");
    case "perl":
      return import("@shikijs/langs/perl");
    case "php":
      return import("@shikijs/langs/php");
    case "powershell":
      return import("@shikijs/langs/powershell");
    case "proto":
      return import("@shikijs/langs/proto");
    case "python":
      return import("@shikijs/langs/python");
    case "r":
      return import("@shikijs/langs/r");
    case "ruby":
      return import("@shikijs/langs/ruby");
    case "rust":
      return import("@shikijs/langs/rust");
    case "scala":
      return import("@shikijs/langs/scala");
    case "scss":
      return import("@shikijs/langs/scss");
    case "shellscript":
      return import("@shikijs/langs/shellscript");
    case "solidity":
      return import("@shikijs/langs/solidity");
    case "sql":
      return import("@shikijs/langs/sql");
    case "svelte":
      return import("@shikijs/langs/svelte");
    case "swift":
      return import("@shikijs/langs/swift");
    case "toml":
      return import("@shikijs/langs/toml");
    case "tsx":
      return import("@shikijs/langs/tsx");
    case "typescript":
      return import("@shikijs/langs/typescript");
    case "vue":
      return import("@shikijs/langs/vue");
    case "xml":
      return import("@shikijs/langs/xml");
    case "yaml":
      return import("@shikijs/langs/yaml");
    case "zig":
      return import("@shikijs/langs/zig");
    default: {
      const unsupportedLanguage: never = language;
      throw new Error(`Unsupported syntax language: ${unsupportedLanguage}`);
    }
  }
}

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
    loading = loadLanguageModule(language).then((module) =>
      highlighter.loadLanguage(module.default)
    );
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
