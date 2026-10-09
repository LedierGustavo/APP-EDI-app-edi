import { useState, useEffect } from "react";
import { ThemeProvider, useTheme } from "@/components/layout/ThemeProvider";
import { CredentialSelector } from "@/features/auth/CredentialSelector";
import { CotacaoPage } from "@/features/cotacao/CotacaoPage";
import { TrackingPage } from "@/features/tracking/TrackingPage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Moon, Sun, Calculator, Package, Download, RefreshCw } from "lucide-react";

function Header({ tab, setTab }: { tab: string; setTab: (t: string) => void }) {
  const { theme, setTheme } = useTheme();
  return (
    <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="font-bold text-lg tracking-tight">APP EDI</h1>
          <nav className="flex gap-1">
            <Button variant={tab === "cotacao" ? "secondary" : "ghost"} size="sm" onClick={() => setTab("cotacao")}><Calculator className="h-4 w-4 mr-2" />Cotação</Button>
            <Button variant={tab === "tracking" ? "secondary" : "ghost"} size="sm" onClick={() => setTab("tracking")}><Package className="h-4 w-4 mr-2" />Tracking v3</Button>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Alternar tema">
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
    api.onUpdateAvailable(() => setAvailable(true));
    api.onUpdateDownloaded(() => { setAvailable(false); setDownloaded(true); });
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

function AppInner() {
  const [tab, setTab] = useState("cotacao");
  return (
    <div className="min-h-screen bg-background">
      <Header tab={tab} setTab={setTab} />
      <UpdateBanner />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <CredentialSelector />
        {tab === "cotacao" ? <CotacaoPage /> : <TrackingPage />}
        <footer className="text-center text-xs text-muted-foreground pt-8 border-t">APP EDI • Produção • api.braspress.com • Tema claro/escuro • 700+ credenciais Supabase • Auto-update GitHub Releases</footer>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider><AppInner /></ThemeProvider>
  );
}
