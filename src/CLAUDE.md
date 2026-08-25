[Root](../CLAUDE.md) > **src**

# Frontend Module (src)

## Responsibilities

UI rendering, interaction, and styling. Built with React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui.

## Entry Points

- **Entry**: `main.tsx`
- **Page Selector**: `main.tsx` maps pathname values to lazily loaded page components
- **Pages**: `pages/home.tsx`, `pages/about.tsx`, `pages/settings.tsx`
- **Build Tool**: Vite 7
- **Dev Port**: 1420

```bash
pnpm dev        # Frontend dev server only
pnpm tauri dev  # Full Tauri app development
```

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| react | ^19.1.0 | UI framework |
| @tauri-apps/api | ^2 | Tauri frontend API |
| tailwindcss | ^4.2.1 | CSS framework |
| lucide-react | ^0.577.0 | Icon library |
| i18next | ^24.2.2 | Internationalization core |
| react-i18next | ^16.2.0 | React i18n integration |
| typescript | ~5.8.3 | TypeScript compiler |
| vite | ^7.0.4 | Build tool |
| prettier | ^3.8.1 | Code formatter |

## Configuration

- `../tsconfig.json` - TypeScript strict mode
- `../vite.config.ts` - Vite build config with `@/` alias
- `../components.json` - shadcn/ui config
- `i18n/index.ts` - i18next configuration

### Path Alias

```typescript
// Configured in tsconfig.json
"@/*": ["./src/*"]

// Usage
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
```

### Internationalization

```typescript
// Usage in components
import { useTranslation } from "react-i18next";

function MyComponent() {
  const { t, i18n } = useTranslation();

  return (
    <div>
      <h1>{t("app.title")}</h1>
      <button onClick={() => i18n.changeLanguage("zh")}>
        {t("language.toggle")}
      </button>
    </div>
  );
}
```

**Supported Languages**: English (en), Chinese (zh)

**Translation Files**: `i18n/locales/{en,zh}.json`

See [I18N Documentation](../docs/I18N.md) for detailed usage.

## Tauri API Usage

```typescript
import { invoke } from "@tauri-apps/api/core";

const result = await invoke("greet", { name: "World" });
// Returns: "Hello, World! You've been greeted from Rust!"
```

## Code Quality

```bash
pnpm format        # Format code
pnpm format:check  # Check formatting
```

## Common Tasks

### Add shadcn/ui Components

```bash
pnpm dlx shadcn@latest add button
pnpm dlx shadcn@latest add input
pnpm dlx shadcn@latest add dialog
```

### Add Routing

1. Create a page component under `src/pages/`
2. Add a lazy import for the page in `src/main.tsx`
3. Register the pathname-to-page mapping in `pageMap` inside `src/main.tsx`

## File Structure

```
src/
├── main.tsx          # Entry point and pathname-based page selector
├── index.css         # Global styles + Tailwind theme
├── vite-env.d.ts     # Vite type declarations
├── assets/           # Static assets
├── components/       # React components
│   ├── ui/          # shadcn/ui components
│   ├── language-toggle.tsx
│   ├── mode-toggle.tsx
│   └── ...
├── i18n/            # Internationalization
│   ├── index.ts     # i18n configuration
│   └── locales/     # Translation files
│       ├── en.json
│       └── zh.json
├── lib/             # Utility functions
│   └── utils.ts
└── pages/           # Page components
    ├── home.tsx
    ├── about.tsx
    └── settings.tsx
```
