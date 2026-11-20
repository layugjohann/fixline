"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { THEME_STORAGE_KEY } from "./theme-script";

const systemDark = () => matchMedia("(prefers-color-scheme: dark)");

function storedTheme(): string | null {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Apply the visitor's choice, or the system preference if they haven't chosen. */
function applyTheme() {
  const stored = storedTheme();
  document.documentElement.classList.toggle("dark", stored ? stored === "dark" : systemDark().matches);
}

/** Re-render whenever the `dark` class on <html> changes. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

const isDark = () => document.documentElement.classList.contains("dark");

/** The rail's light/dark switch. Follows the system until the visitor picks one. */
export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  useEffect(() => {
    // The root layout's script handles a full page load; this covers arriving by client navigation.
    applyTheme();
    const media = systemDark();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, []);

  const label = dark ? "Switch to light theme" : "Switch to dark theme";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={() => {
            try {
              localStorage.setItem(THEME_STORAGE_KEY, dark ? "light" : "dark");
            } catch {
              // Storage blocked: the switch still works for this page.
            }
            document.documentElement.classList.toggle("dark", !dark);
          }}
          className="grid size-10 place-items-center rounded-lg text-rail-foreground outline-none hover:bg-rail-active hover:text-rail-active-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
