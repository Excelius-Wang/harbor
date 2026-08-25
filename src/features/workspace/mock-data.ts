export type WorkspaceSection = "pullRequests" | "repositories" | "discover";

export type ActivityKind = "merged" | "opened" | "commented";
export type DiscoverTab = "trending" | "forYou" | "collections";
export type TrendingPeriod = "today" | "week" | "month";

export type RepositoryActivity = {
  id: string;
  kind: ActivityKind;
  subject: string;
  title: string;
  time: string;
  branch?: string;
};

export type LanguageShare = {
  name: string;
  percentage: number;
  color: string;
};

export type Repository = {
  id: string;
  owner: string;
  name: string;
  description: string;
  mark: string;
  markTone: string;
  language: string;
  languageColor: string;
  stars: string;
  forks: string;
  growth: Record<TrendingPeriod, number>;
  spokenLanguage: "en" | "zh";
  featured: boolean;
  topics: string[];
  url: string;
  languages: LanguageShare[];
  activity: RepositoryActivity[];
};

export const repositories: Repository[] = [
  {
    id: "zed",
    owner: "zed-industries",
    name: "zed",
    description: "Code at the speed of thought — a high-performance, collaborative code editor.",
    mark: "Z",
    markTone: "bg-zinc-950 text-white dark:bg-black",
    language: "Rust",
    languageColor: "#a78bfa",
    stars: "24.3k",
    forks: "2.1k",
    growth: { today: 4, week: 28, month: 112 },
    spokenLanguage: "en",
    featured: true,
    topics: ["editor", "ide", "rust", "collaboration", "performance"],
    url: "https://github.com/zed-industries/zed",
    languages: [
      { name: "Rust", percentage: 82.6, color: "#a78bfa" },
      { name: "TypeScript", percentage: 10.2, color: "#38bdf8" },
      { name: "JavaScript", percentage: 4.9, color: "#facc15" },
      { name: "Other", percentage: 2.3, color: "#94a3b8" },
    ],
    activity: [
      {
        id: "zed-1",
        kind: "merged",
        subject: "PR #12345",
        title: "Add inline completion",
        time: "2h ago",
        branch: "main",
      },
      {
        id: "zed-2",
        kind: "opened",
        subject: "Issue #9876",
        title: "Crash when opening large file",
        time: "5h ago",
      },
      {
        id: "zed-3",
        kind: "merged",
        subject: "PR #12344",
        title: "Improve Git status performance",
        time: "1d ago",
        branch: "main",
      },
      {
        id: "zed-4",
        kind: "commented",
        subject: "Issue #9765",
        title: "Multi-cursor selection",
        time: "1d ago",
      },
    ],
  },
  {
    id: "ruff",
    owner: "astral-sh",
    name: "ruff",
    description: "An extremely fast Python linter and code formatter.",
    mark: "R",
    markTone: "bg-[#fff3d6] text-[#241a08]",
    language: "Python",
    languageColor: "#3b82f6",
    stars: "18.7k",
    forks: "1.6k",
    growth: { today: 3, week: 19, month: 74 },
    spokenLanguage: "en",
    featured: true,
    topics: ["python", "linter", "formatter", "rust"],
    url: "https://github.com/astral-sh/ruff",
    languages: [
      { name: "Rust", percentage: 96.4, color: "#a78bfa" },
      { name: "Python", percentage: 2.8, color: "#3b82f6" },
      { name: "Other", percentage: 0.8, color: "#94a3b8" },
    ],
    activity: [],
  },
  {
    id: "ollama",
    owner: "ollama",
    name: "ollama",
    description: "Get up and running with Llama, Mistral, Gemma, and other large language models.",
    mark: "O",
    markTone: "bg-stone-100 text-stone-950",
    language: "Go",
    languageColor: "#38bdf8",
    stars: "16.1k",
    forks: "2.3k",
    growth: { today: 2, week: 15, month: 63 },
    spokenLanguage: "en",
    featured: true,
    topics: ["llm", "go", "local-ai", "models"],
    url: "https://github.com/ollama/ollama",
    languages: [
      { name: "Go", percentage: 84.1, color: "#38bdf8" },
      { name: "C", percentage: 10.7, color: "#64748b" },
      { name: "Other", percentage: 5.2, color: "#94a3b8" },
    ],
    activity: [],
  },
  {
    id: "deno",
    owner: "denoland",
    name: "deno",
    description: "A modern JavaScript and TypeScript runtime.",
    mark: "D",
    markTone: "bg-black text-white",
    language: "TypeScript",
    languageColor: "#38bdf8",
    stars: "15.2k",
    forks: "1.2k",
    growth: { today: 2, week: 12, month: 49 },
    spokenLanguage: "en",
    featured: false,
    topics: ["runtime", "typescript", "javascript", "rust"],
    url: "https://github.com/denoland/deno",
    languages: [
      { name: "Rust", percentage: 61.8, color: "#a78bfa" },
      { name: "TypeScript", percentage: 31.4, color: "#38bdf8" },
      { name: "Other", percentage: 6.8, color: "#94a3b8" },
    ],
    activity: [],
  },
  {
    id: "rustdesk",
    owner: "rustdesk",
    name: "rustdesk",
    description: "Open-source remote desktop with self-hosted control.",
    mark: "R",
    markTone: "bg-[#eff6ff] text-[#2563eb]",
    language: "Rust",
    languageColor: "#a78bfa",
    stars: "13.8k",
    forks: "1.1k",
    growth: { today: 1, week: 9, month: 38 },
    spokenLanguage: "zh",
    featured: false,
    topics: ["remote-desktop", "rust", "self-hosted"],
    url: "https://github.com/rustdesk/rustdesk",
    languages: [
      { name: "Rust", percentage: 72.9, color: "#a78bfa" },
      { name: "Dart", percentage: 23.5, color: "#38bdf8" },
      { name: "Other", percentage: 3.6, color: "#94a3b8" },
    ],
    activity: [],
  },
];

export const pinnedRepositories = ["harbor", "desktop", "vscode"];
