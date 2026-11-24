import { useEffect, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChevronRight, SlidersHorizontal, X } from "lucide-react";

type CredentialDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: string;
  selected?: string | null;
  client?: string | null;
  environment?: string | null;
  detail?: string | null;
  icon: LucideIcon;
  children: ReactNode;
};

export function CredentialDrawer({
  open,
  onOpenChange,
  category,
  selected,
  client,
  environment,
  detail,
  icon: Icon,
  children,
}: CredentialDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector(".credential-modal-overlay")) {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, onOpenChange]);

  const hasSelection = Boolean(selected);

  return (
    <>
      <div className="credential-summary-bar">
        <button
          type="button"
          className="credential-summary-trigger"
          onClick={() => onOpenChange(true)}
          aria-haspopup="dialog"
          aria-label={`Selecionar credencial para ${category}`}
        >
          <span className="credential-summary-icon"><Icon className="h-[18px] w-[18px]" /></span>
          <span className="credential-summary-copy">
            <span className="credential-summary-category">{category}</span>
            <strong title={selected || undefined}>{selected || "Selecione uma credencial"}</strong>
            <span className="credential-summary-meta">
              {client || (hasSelection ? "Cliente não identificado" : "Nenhuma credencial selecionada")}
              {environment && <span className="credential-environment">{environment}</span>}
              {detail && <span className="credential-summary-detail">{detail}</span>}
            </span>
          </span>
          <span className={`credential-summary-state ${hasSelection ? "is-selected" : ""}`}>
            <span />
            {hasSelection ? "Selecionada" : "Ação necessária"}
          </span>
          <ChevronRight className="credential-summary-chevron h-4 w-4" />
        </button>
        <Button
          type="button"
          variant="outline"
          className="credential-manage-button"
          onClick={() => onOpenChange(true)}
          aria-haspopup="dialog"
          aria-label="Gerenciar credenciais"
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span>Gerenciar</span>
        </Button>
      </div>
      {open && (
        <div className="credential-drawer-overlay" onMouseDown={(event) => {
          if (event.target === event.currentTarget) onOpenChange(false);
        }}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="credential-drawer-title"
            className="credential-drawer"
          >
            <header className="credential-drawer-header">
              <div>
                <span className="credential-drawer-kicker">{category}</span>
                <h2 id="credential-drawer-title">Credenciais</h2>
                <p>Selecione e gerencie seus acessos cadastrados.</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="credential-drawer-close"
                onClick={() => onOpenChange(false)}
                aria-label="Fechar gaveta de credenciais"
              >
                <X className="h-4 w-4" />
              </Button>
            </header>
            <div className="credential-drawer-body">{children}</div>
          </aside>
        </div>
      )}
    </>
  );
}
