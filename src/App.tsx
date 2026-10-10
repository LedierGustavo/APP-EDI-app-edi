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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Moon, Sun, Calculator, Package, Download, RefreshCw, Truck, MapPin } from "lucide-react";

const navItems = [
  { to: "/cotacao", label: "Cotação", icon: Calculator },
  { to: "/tracking", label: "Tracking v3", icon: Package },
  { to: "/soap", label: "SOAP", icon: Truck },
  { to: "/rotacep", label: "RotaCep", icon: MapPin },
];

function Header() {
  const { theme, setTheme } = useTheme();
  return (
    <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="font-bold text-lg tracking-tight">APP EDI</h1>
          <nav className="flex gap-1" aria-label="Navegação principal">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center justify-center gap-2 rounded-md h-8 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive ? "bg-secondary text-secondary-foreground" : "hover:bg-accent hover:text-accent-foreground",
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
          <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Alternar tema" aria-label="Alternar tema">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
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
    <div className="max-w-7xl mx-auto px-4 pt-4">
      <Card className={downloaded ? "border-green-300 bg-green-50 dark:bg-green-950/30" : "border-amber-300 bg-amber-50 dark:bg-amber-950/30"}>
        <CardContent className="p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            {downloaded ? <Download className="h-4 w-4 text-green-600" /> : <RefreshCw className="h-4 w-4 text-amber-600 animate-spin" />}
            <span className={downloaded ? "text-green-800 dark:text-green-200" : "text-amber-800 dark:text-amber-200"}>
              {downloaded ? "Atualização baixada em segundo plano. Reiniciar agora para aplicar?" : "Nova atualização encontrada. Baixando em segundo plano (não interrompe sua cotação)..."}
            </span>
          </div>
          <div className="flex gap-2">
            {downloaded ? (
              <>
                <Button size="sm" onClick={() => (window as any).api?.restartToUpdate()}>Reiniciar agora</Button>
                <Button size="sm" variant="outline" onClick={() => setDownloaded(false)}>Depois</Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Você será notificado quando concluir</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CredentialLayout() {
  return (
    <>
      <CredentialSelector />
      <Outlet />
    </>
  );
}

function AppInner() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <UpdateBanner />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <ErrorBoundary>
          <Routes>
            <Route element={<CredentialLayout />}>
              <Route path="/cotacao" element={<CotacaoPage />} />
              <Route path="/tracking" element={<TrackingPage />} />
            </Route>
            <Route path="/soap" element={<SoapPage />} />
            <Route path="/rotacep" element={<RotaCepPage />} />
            <Route path="*" element={<Navigate to="/cotacao" replace />} />
          </Routes>
        </ErrorBoundary>
        <footer className="text-center text-xs text-muted-foreground pt-8 border-t">APP EDI • Produção • api.braspress.com • Tema claro/escuro • 700+ credenciais Supabase • Auto-update GitHub Releases</footer>
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
