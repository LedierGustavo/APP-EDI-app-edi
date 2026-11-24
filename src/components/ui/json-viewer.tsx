import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Copy, Check, ChevronDown, ChevronRight } from "lucide-react";

function highlightJson(value: unknown): string {
  const json = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  // Simple tokenizer for syntax highlight via spans
  return json
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, (m) => {
      let cls = "text-slate-200";
      if (/^"/.test(m)) {
        cls = /:$/.test(m) ? "text-violet-300 font-medium" : "text-emerald-300";
      } else if (/true|false/.test(m)) cls = "text-amber-300";
      else if (/null/.test(m)) cls = "text-slate-500";
      else if (/-?\d/.test(m)) cls = "text-cyan-300";
      return `<span class="${cls}">${m}</span>`;
    });
}

function CollapsibleJson({ data, level = 0, maxDepth = 3 }: { data: any; level?: number; maxDepth?: number }) {
  const [collapsed, setCollapsed] = useState(level >= maxDepth);
  if (data === null) return <span className="text-slate-500">null</span>;
  if (typeof data !== "object") {
    if (typeof data === "string") return <span className="text-emerald-300">"{data}"</span>;
    if (typeof data === "number") return <span className="text-cyan-300">{String(data)}</span>;
    if (typeof data === "boolean") return <span className="text-amber-300">{String(data)}</span>;
    return <span className="text-slate-200">{String(data)}</span>;
  }
  const isArray = Array.isArray(data);
  const keys = Object.keys(data);
  if (keys.length === 0) return <span className="text-slate-500">{isArray ? "[]" : "{}"}</span>;
  return (
    <span>
      <button onClick={() => setCollapsed(!collapsed)} className="mr-1 inline-flex items-center gap-1 text-slate-400 hover:text-white">
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        <span className="text-xs text-slate-300">{isArray ? "[" : "{"}</span>
        {collapsed && <span className="text-xs text-slate-500">... {keys.length} {isArray ? "itens" : "chaves"} {isArray ? "]" : "}"}</span>}
      </button>
      {!collapsed && (
        <span className="block ml-4 border-l border-border/50 pl-3 space-y-0.5">
          {keys.map((k, idx) => (
            <div key={k} className="break-all font-mono text-xs leading-relaxed">
              {!isArray && <span className="font-medium text-violet-300">"{k}"</span>}
              {!isArray && <span className="text-slate-500">: </span>}
              <CollapsibleJson data={data[k]} level={level + 1} maxDepth={maxDepth} />
              {idx < keys.length - 1 && <span className="text-slate-500">,</span>}
            </div>
          ))}
          <span className="text-xs text-slate-500">{isArray ? "]" : "}"}</span>
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
    <div className="json-viewer overflow-hidden rounded-xl border border-white/10 bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-slate-900/80 px-3 py-2">
        <div className="flex items-center gap-2">
          {title && <span className="text-xs font-medium">{title}</span>}
          <div className="flex rounded-lg border border-white/10 bg-slate-950 p-0.5">
            <button onClick={() => setView("tree")} className={cn("rounded-md px-2 py-1 text-xs", view === "tree" ? "bg-blue-500/20 text-cyan-200" : "text-slate-400 hover:text-white")}>Árvore</button>
            <button onClick={() => setView("raw")} className={cn("rounded-md px-2 py-1 text-xs", view === "raw" ? "bg-blue-500/20 text-cyan-200" : "text-slate-400 hover:text-white")}>Raw</button>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleCopy}>
          {copied ? <Check className="h-3 w-3 mr-1 text-green-600" /> : <Copy className="h-3 w-3 mr-1" />}
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <div className="max-h-[420px] overflow-auto bg-slate-950 p-3 text-slate-200 scrollbar-thin">
        {view === "raw" ? (
          isString ? (
            <pre className="whitespace-pre-wrap break-all font-mono text-xs text-slate-200">{displayData as string}</pre>
          ) : (
            <pre className="whitespace-pre-wrap break-all font-mono text-xs" dangerouslySetInnerHTML={{ __html: highlightJson(data) }} />
          )
        ) : isString ? (
          <pre className="text-xs font-mono whitespace-pre-wrap break-all">{String(displayData)}</pre>
        ) : (
          <div className="break-all font-mono text-xs">
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
    <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-slate-900/80 px-3 py-2">
        <span className="text-xs font-medium">{title}</span>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleCopy}>
          {copied ? <Check className="h-3 w-3 mr-1 text-green-600" /> : <Copy className="h-3 w-3 mr-1" />}
          {copied ? "Copiado" : "Copiar XML"}
        </Button>
      </div>
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-all bg-slate-950 p-3 font-mono text-xs scrollbar-thin">
        <code>
          {pretty.split("\n").map((line, i) => {
            const isTag = line.trim().startsWith("<");
            return (
              <span key={i} className={cn("block", isTag ? "text-cyan-300" : "text-slate-200")}>
                {line}
              </span>
            );
          })}
        </code>
      </pre>
    </div>
  );
}
