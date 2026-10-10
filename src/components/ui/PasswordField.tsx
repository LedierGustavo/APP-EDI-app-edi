import { forwardRef, useRef, useState, type ComponentProps, type MutableRefObject } from "react";
import { Eye, EyeOff, Copy } from "lucide-react";
import { toast } from "sonner";
import { Input } from "./input";
import { cn } from "@/lib/utils";

type PasswordFieldProps = ComponentProps<typeof Input> & { containerClassName?: string };

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(
  { className, containerClassName, value, ...props },
  ref,
) {
  const [show, setShow] = useState(false);
  const innerRef = useRef<HTMLInputElement>(null);

  const setRefs = (node: HTMLInputElement | null) => {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as MutableRefObject<HTMLInputElement | null>).current = node;
  };

  const isControlled = value !== undefined;

  const handleCopy = async () => {
    const text = innerRef.current?.value ?? (typeof value === "string" ? value : "");
    if (!text) {
      toast.warning("Nada para copiar.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Senha copiada para a área de transferência!");
    } catch {
      toast.error("Não foi possível acessar a área de transferência.");
    }
  };

  return (
    <div className={cn("relative", containerClassName)}>
      <Input
        ref={setRefs}
        type={show ? "text" : "password"}
        className={cn("pr-16", className)}
        {...(isControlled ? { value } : {})}
        {...props}
      />
      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Ocultar senha" : "Exibir senha"}
          title={show ? "Ocultar senha" : "Exibir senha"}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copiar senha"
          title="Copiar senha"
          className="p-1.5 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
});

PasswordField.displayName = "PasswordField";
