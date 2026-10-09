import * as React from "react";
type Theme = "light" | "dark" | "system";
const ThemeContext = React.createContext<{ theme: Theme; setTheme: (t: Theme) => void } | null>(null);
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(() => (localStorage.getItem("app-edi-theme") as Theme) || "system");
  const setTheme = (t: Theme) => { localStorage.setItem("app-edi-theme", t); setThemeState(t); apply(t); };
  const apply = (t: Theme) => {
    const root = document.documentElement;
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = t === "dark" || (t === "system" && systemDark);
    root.classList.toggle("dark", isDark);
  };
  React.useEffect(() => { apply(theme); const m = window.matchMedia("(prefers-color-scheme: dark)"); const h = () => { if (theme === "system") apply("system"); }; m.addEventListener("change", h); return () => m.removeEventListener("change", h); }, [theme]);
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
export function useTheme() { const ctx = React.useContext(ThemeContext); if (!ctx) throw new Error("no theme"); return ctx; }
