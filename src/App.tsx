import { useState, useEffect } from "react";
import { HashRouter, Routes, Route, Navigate, NavLink, Outlet } from "react-router-dom";
import { Toaster } from "sonner";
import { ThemeProvider, useTheme } from "@/components/layout/ThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CredentialSelector } from "@/features/auth/CredentialSelector";
import { CotacaoPage } from "@/features/cotacao/CotacaoPage";
import { TrackingPage } from "@/features/tracking/TrackingPage";
import { SoapPage } from "@/features/soap/SoapPage";
import { RotaCepPage } from "@/features/rotacep/RotaCepPage";
import { BulkCredentialPage } from "@/features/auth/BulkCredentialPage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Moon, Sun, Calculator, Package, Download, RefreshCw, Truck, MapPin, Boxes, KeyRound } from "lucide-react";

const navItems = [
  { to: "/cotacao", label: "Cotação", icon: Calculator },
  { to: "/tracking", label: "Tracking v3", icon: Package },
  { to: "/soap", label: "SOAP", icon: Truck },
  { to: "/rotacep", label: "RotaCep", icon: MapPin },
  { to: "/credenciais-lote", label: "Credenciais", icon: KeyRound },
];

function Header() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  return (
    <header className="app-header sticky top-0 z-10 border-b backdrop-blur-xl">
      <div className="h-1 bg-gradient-to-r from-primary/30 via-primary to-primary/30" aria-hidden="true" />
      <div className="flex min-h-16 w-full flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-6">
          <div className="flex shrink-0 items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
              <Boxes className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <h1 className="font-bold tracking-tight">APP EDI</h1>
            </div>
          </div>
          <nav className="app-navigation flex min-w-0 gap-1 overflow-x-auto" aria-label="Navegação principal">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="rounded-xl bg-card/70 shadow-sm" onClick={() => setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark")} title="Alternar tema" aria-label="Alternar tema">
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </header>
  );
}

function UpdateBanner() {
  const [available, setAvailable] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  useEffect(() => {
    const api = (window as any).api;
    if (!api?.onUpdateAvailable) return;
    const offAvailable = api.onUpdateAvailable(() => setAvailable(true));
    const offDownloaded = api.onUpdateDownloaded(() => { setAvailable(false); setDownloaded(true); });
    return () => {
      if (typeof offAvailable === "function") offAvailable();
      if (typeof offDownloaded === "function") offDownloaded();
    };
  }, []);
  if (!available && !downloaded) return null;
  return (
    <div className="mx-auto w-full px-4 pt-4 sm:px-6">
      <Card className={downloaded ? "border-green-300 bg-green-50 dark:bg-green-950/30" : "border-amber-300 bg-amber-50 dark:bg-amber-950/30"}>
        <CardContent className="p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            {downloaded ? <Download className="h-4 w-4 text-green-600" /> : <RefreshCw className="h-4 w-4 text-amber-600 animate-spin" />}
            <span className={downloaded ? "text-green-800 dark:text-green-200" : "text-amber-800 dark:text-amber-200"}>
              {downloaded ? "Atualização baixada. Reiniciar para aplicar?" : "Atualização disponível. Baixando..."}
            </span>
          </div>
          {downloaded && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => (window as any).api?.restartToUpdate()}>Reiniciar agora</Button>
              <Button size="sm" variant="outline" onClick={() => setDownloaded(false)}>Depois</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CredentialLayout() {
  return (
    <div className="credential-layout">
      <aside className="credential-sidebar min-w-0">
        <CredentialSelector />
      </aside>
      <section className="workspace-content min-w-0">
        <Outlet />
      </section>
    </div>
  );
}

function AppInner() {
  return (
    <div className="app-shell min-h-screen bg-background">
      <Header />
      <UpdateBanner />
      <main className="app-main mx-auto w-full min-w-0 space-y-6 px-3 py-4 sm:px-5 lg:px-6 lg:py-6">
        <ErrorBoundary>
          <Routes>
            <Route element={<CredentialLayout />}>
              <Route path="/cotacao" element={<CotacaoPage />} />
              <Route path="/tracking" element={<TrackingPage />} />
            </Route>
            <Route path="/soap" element={<SoapPage />} />
            <Route path="/rotacep" element={<RotaCepPage />} />
            <Route path="/credenciais-lote" element={<BulkCredentialPage />} />
            <Route path="*" element={<Navigate to="/cotacao" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <HashRouter>
        <AppInner />
      </HashRouter>
      <Toaster position="top-right" richColors closeButton />
    </ThemeProvider>
  );
}
