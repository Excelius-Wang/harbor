import React, { lazy, Suspense, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./index.css";
import "./i18n";

const HomePage = lazy(() => import("./pages/home"));
const AboutPage = lazy(() => import("./pages/about"));
const SettingsPage = lazy(() => import("./pages/settings"));

const pageMap = {
  "/": HomePage,
  "/about": AboutPage,
  "/settings": SettingsPage,
};

const pathname = window.location.pathname;
const PageComponent = pageMap[pathname as keyof typeof pageMap] ?? HomePage;

function AppWrapper() {
  useEffect(() => {
    // Show window after React is ready
    if (isTauri()) void getCurrentWindow().show();
  }, []);

  return (
    <TooltipProvider delayDuration={350}>
      <PageComponent />
    </TooltipProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      <AppWrapper />
    </Suspense>
  </React.StrictMode>
);
