import * as React from "react";
import { cn } from "@/lib/utils";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type, ...props }, ref) => (
  <input type={type} className={cn("flex h-10 w-full rounded-xl border border-input bg-background/80 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1", className)} ref={ref} {...props} />
));
Input.displayName = "Input";
