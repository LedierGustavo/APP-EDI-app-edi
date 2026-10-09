import * as React from "react";
import { cn } from "@/lib/utils";
export function Select({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: React.ReactNode }) {
  return <div>{React.Children.map(children, (c: any) => React.cloneElement(c, { value, onValueChange }))}</div>;
}
export function SelectTrigger({ value, onValueChange, children, className }: any) {
  return <select value={value} onChange={(e) => onValueChange(e.target.value)} className={cn("flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm", className)}>{children}</select>;
}
export function SelectContent({ children }: any) { return <>{children}</>; }
export function SelectItem({ value, children }: any) { return <option value={value}>{children}</option>; }
export function SelectValue({ placeholder }: any) { return <span>{placeholder}</span>; }
