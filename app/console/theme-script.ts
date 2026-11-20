/** Where the visitor's light/dark choice is kept. Absent means "follow the system". */
export const THEME_STORAGE_KEY = "fixline-theme";

/**
 * Runs before the first paint (from the root layout) so a dark-mode visitor never sees a
 * light flash: dark if they chose it, or if they chose nothing and the system prefers it.
 */
export const themeScript = `(() => {
  try {
    const stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    const dark = stored ? stored === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", dark);
  } catch {}
})();`;
