const LANGUAGE_COLORS: Record<string, string> = {
  "C#": "#178600",
  "C++": "#f34b7d",
  C: "#555555",
  CSS: "#563d7c",
  Dart: "#00b4ab",
  Elixir: "#6e4a7e",
  Go: "#00add8",
  Haskell: "#5e5086",
  HTML: "#e34c26",
  Java: "#b07219",
  JavaScript: "#f1e05a",
  "Jupyter Notebook": "#da5b0b",
  Kotlin: "#a97bff",
  Lua: "#000080",
  Nix: "#7e7eff",
  PHP: "#4f5d95",
  Python: "#3572a5",
  R: "#198ce7",
  Ruby: "#701516",
  Rust: "#dea584",
  Scala: "#c22d40",
  Shell: "#89e051",
  Solidity: "#aa6746",
  Svelte: "#ff3e00",
  Swift: "#f05138",
  TypeScript: "#3178c6",
  Vue: "#41b883",
  Zig: "#ec915c",
};

export function repositoryLanguageColor(language: string) {
  return LANGUAGE_COLORS[language] ?? "var(--muted-foreground)";
}
