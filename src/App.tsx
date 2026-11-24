import { useState, useEffect } from "react";
import { HashRouter, Routes, Route, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { ThemeProvider, useTheme } from "@/components/layout/ThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CredentialSelector } from "@/features/auth/CredentialSelector";
import { CotacaoPage } from "@/features/cotacao/CotacaoPage";
import { TrackingPage } from "@/features/tracking/TrackingPage";
import { SoapPage } from "@/features/soap/SoapPage";
import { RotaCepPage } from "@/features/rotacep/RotaCepPage";
import { EtiquetaPage } from "@/features/rotacep/EtiquetaPage";
import { BulkCredentialPage } from "@/features/auth/BulkCredentialPage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Moon, Sun, Calculator, Package, Download, RefreshCw, Truck, MapPin, Boxes, KeyRound, Tags, ChevronRight } from "lucide-react";

const navItems = [
  { to: "/cotacao", label: "Cotação", title: "Cotação de frete", description: "Simule fretes e confira o payload antes de enviar.", icon: Calculator },
  { to: "/tracking", label: "Rastreamento", title: "Rastreamento", description: "Acompanhe notas fiscais e pedidos em um só lugar.", icon: Package },
  { to: "/soap", label: "Tracking SOAP", title: "Tracking SOAP", description: "Consulte ocorrências de transporte por SOAP.", icon: Truck },
  { to: "/rotacep", label: "RotaCEP", title: "Consulta RotaCEP", description: "Consulte a filial e a rota de entrega pelo CEP.", icon: MapPin },
  { to: "/etiqueta", label: "Etiquetas", title: "Geração de etiquetas", description: "Gere etiquetas a partir dos dados da nota fiscal.", icon: Tags },
  { to: "/credenciais-lote", label: "Credenciais em lote", title: "Credenciais", description: "Cadastre acessos EDI em lote com validação.", icon: KeyRound },
];

function AppSidebar() {
  return (
    <aside className="app-sidebar">
      <div className="app-brand">
        <span className="app-brand-mark"><Boxes className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h1>APP EDI</h1>
          <p>Workspace operacional</p>
        </div>
      </div>
      <div className="app-nav-label">Workspace</div>
      <nav className="app-navigation" aria-label="Navegação principal">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => cn("app-nav-link", isActive && "app-nav-link-active")}
          >
            <Icon className="h-[18px] w-[18px]" />
            <span>{label}</span>
            {to === "/cotacao" && <span className="app-nav-shortcut">01</span>}
          </NavLink>
        ))}
      </nav>
      <div className="app-sidebar-footer">
        <span className="app-footer-mark"><Boxes className="h-4 w-4" /></span>
        <div>
          <p>APP EDI</p>
          <span>Operações integradas</span>
        </div>
      </div>
    </aside>
  );
}

function Header() {
  const { theme, setTheme } = useTheme();
  const { pathname } = useLocation();
  const activePage = navItems.find((item) => item.to === pathname) ?? navItems[0];
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  return (
    <header className="app-header">
      <div className="app-page-heading">
        <div className="min-w-0">
          <div className="app-breadcrumb">
            <span>APP EDI</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span>{activePage.label}</span>
          </div>
          <h2>{activePage.title}</h2>
          <p>{activePage.description}</p>
        </div>
        <Button variant="outline" size="icon" className="app-theme-toggle" onClick={() => setTheme(isDark ? "light" : "dark")} title="Alternar tema" aria-label="Alternar tema">
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
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
      <CredentialSelector />
      <section className="workspace-content min-w-0">
        <Outlet />
      </section>
    </div>
  );
}

function AppInner() {
  return (
    <div className="app-shell">
      <AppSidebar />
      <div className="app-frame">
        <Header />
        <UpdateBanner />
        <main className="app-main">
          <ErrorBoundary>
            <Routes>
              <Route element={<CredentialLayout />}>
                <Route path="/cotacao" element={<CotacaoPage />} />
                <Route path="/tracking" element={<TrackingPage />} />
              </Route>
              <Route path="/soap" element={<SoapPage />} />
              <Route path="/rotacep" element={<RotaCepPage />} />
              <Route path="/etiqueta" element={<EtiquetaPage />} />
              <Route path="/credenciais-lote" element={<BulkCredentialPage />} />
              <Route path="*" element={<Navigate to="/cotacao" replace />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
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
