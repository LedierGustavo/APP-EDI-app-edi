import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Copy, Check, ChevronDown, ChevronRight } from "lucide-react";

function highlightJson(value: unknown): string {
  const json = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  // Simple tokenizer for syntax highlight via spans
  return json
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (m) => {
      let cls = "text-foreground";
      if (/^"/.test(m)) {
        cls = /:$/.test(m) ? "text-primary font-medium" : "text-emerald-600 dark:text-emerald-400";
      } else if (/true|false/.test(m)) cls = "text-amber-600 dark:text-amber-400";
      else if (/null/.test(m)) cls = "text-muted-foreground";
      else if (/-?\d/.test(m)) cls = "text-cyan-600 dark:text-cyan-400";
      return `<span class="${cls}">${m}</span>`;
    });
}

function CollapsibleJson({ data, level = 0, maxDepth = 3 }: { data: any; level?: number; maxDepth?: number }) {
  const [collapsed, setCollapsed] = useState(level >= maxDepth);
  if (data === null) return <span className="text-muted-foreground">null</span>;
  if (typeof data !== "object") {
    if (typeof data === "string") return <span className="text-emerald-600 dark:text-emerald-400">"{data}"</span>;
    if (typeof data === "number") return <span className="text-cyan-600 dark:text-cyan-400">{String(data)}</span>;
    if (typeof data === "boolean") return <span className="text-amber-600 dark:text-amber-400">{String(data)}</span>;
    return <span>{String(data)}</span>;
  }
  const isArray = Array.isArray(data);
  const keys = Object.keys(data);
  if (keys.length === 0) return <span className="text-muted-foreground">{isArray ? "[]" : "{}"}</span>;
  return (
    <span>
      <button onClick={() => setCollapsed(!collapsed)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground mr-1">
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        <span className="text-xs">{isArray ? "[" : "{"}</span>
        {collapsed && <span className="text-xs text-muted-foreground">... {keys.length} {isArray ? "itens" : "chaves"} {isArray ? "]" : "}"}</span>}
      </button>
      {!collapsed && (
        <span className="block ml-4 border-l border-border/50 pl-3 space-y-0.5">
          {keys.map((k, idx) => (
            <div key={k} className="text-xs font-mono leading-relaxed">
              {!isArray && <span className="text-primary font-medium">"{k}"</span>}
              {!isArray && <span className="text-muted-foreground">: </span>}
              <CollapsibleJson data={data[k]} level={level + 1} maxDepth={maxDepth} />
              {idx < keys.length - 1 && <span className="text-muted-foreground">,</span>}
            </div>
          ))}
          <span className="text-xs text-muted-foreground">{isArray ? "]" : "}"}</span>
        </span>
      )}
    </span>
  );
}

export function JsonViewer({ data, raw, title, defaultCollapsed = false }: { data: any; raw?: string; title?: string; defaultCollapsed?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<"tree" | "raw">("tree");
  const isString = typeof data === "string";
  const displayData = isString ? raw || data : data;

  const handleCopy = async () => {
    const text = typeof displayData === "string" ? displayData : JSON.stringify(data, null, 2);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          {title && <span className="text-xs font-medium">{title}</span>}
          <div className="flex rounded-md border bg-background p-0.5">
            <button onClick={() => setView("tree")} className={cn("px-2 py-1 text-xs rounded", view === "tree" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>Árvore</button>
            <button onClick={() => setView("raw")} className={cn("px-2 py-1 text-xs rounded", view === "raw" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>Raw</button>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleCopy}>
          {copied ? <Check className="h-3 w-3 mr-1 text-green-600" /> : <Copy className="h-3 w-3 mr-1" />}
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <div className="p-3 max-h-[420px] overflow-auto scrollbar-thin bg-muted/20">
        {view === "raw" ? (
          isString ? (
            <pre className="text-xs font-mono whitespace-pre-wrap break-all text-foreground">{displayData as string}</pre>
          ) : (
            <pre className="text-xs font-mono whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: highlightJson(data) }} />
          )
        ) : isString ? (
          <pre className="text-xs font-mono whitespace-pre-wrap break-all">{String(displayData)}</pre>
        ) : (
          <div className="text-xs font-mono">
            <CollapsibleJson data={data} maxDepth={defaultCollapsed ? 1 : 3} />
          </div>
        )}
      </div>
    </div>
  );
}

export function XmlViewer({ xml, title = "XML" }: { xml: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(xml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  // Simple XML pretty via replace
  const pretty = xml.replace(/></g, ">\n<").replace(/\n\s*\n/g, "\n");
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <span className="text-xs font-medium">{title}</span>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleCopy}>
          {copied ? <Check className="h-3 w-3 mr-1 text-green-600" /> : <Copy className="h-3 w-3 mr-1" />}
          {copied ? "Copiado" : "Copiar XML"}
        </Button>
      </div>
      <pre className="text-xs font-mono p-3 max-h-[420px] overflow-auto scrollbar-thin bg-muted/20 whitespace-pre-wrap break-all">
        {pretty.split("\n").map((line, i) => {
          const isTag = line.trim().startsWith("<");
          return (
            <div key={i} className={isTag ? "text-cyan-600 dark:text-cyan-400" : "text-foreground"}>
              {line}
            </div>
          );
        })}
      </pre>
    </div>
  );
}
