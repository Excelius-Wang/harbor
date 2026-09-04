import { createContext, useContext, useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { Effect, EffectState, getCurrentWindow } from "@tauri-apps/api/window";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  );

  useEffect(() => {
    const root = window.document.documentElement;
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const resolvedTheme = theme === "system" ? (colorScheme.matches ? "dark" : "light") : theme;

      root.classList.remove("light", "dark");
      root.classList.add(resolvedTheme);

      if (isTauri()) {
        const appWindow = getCurrentWindow();
        const glassEffect =
          resolvedTheme === "dark" ? Effect.HudWindow : Effect.UnderWindowBackground;

        void appWindow
          .setTheme(resolvedTheme)
          .then(() =>
            appWindow.setEffects({
              effects: [glassEffect],
              state: EffectState.FollowsWindowActiveState,
              radius: 10,
            })
          )
          .catch((error) => {
            console.warn("Failed to synchronize the native window appearance:", error);
          });
      }
    };

    applyTheme();
    if (theme !== "system") return;

    colorScheme.addEventListener("change", applyTheme);
    return () => colorScheme.removeEventListener("change", applyTheme);
  }, [theme]);

  // Listen for localStorage changes to sync theme across windows
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        setTheme(e.newValue as Theme);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [storageKey]);

  const value = {
    theme,
    setTheme: (newTheme: Theme) => {
      localStorage.setItem(storageKey, newTheme);
      setTheme(newTheme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  if (context === undefined) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
};
