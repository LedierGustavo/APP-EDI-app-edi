import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const buttonVariants = cva("inline-flex items-center justify-center rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none active:translate-y-px", {
  variants: {
    variant: { default: "bg-primary text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20", destructive: "bg-red-600 text-white shadow-sm shadow-red-600/20 hover:bg-red-700", outline: "border border-input bg-background/80 hover:border-primary/30 hover:bg-accent hover:text-accent-foreground", secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80", ghost: "hover:bg-accent hover:text-accent-foreground", link: "text-primary underline-offset-4 hover:underline" },
    size: { default: "h-10 px-4 py-2", sm: "h-9 rounded-lg px-3 text-xs", lg: "h-11 rounded-xl px-8", icon: "h-10 w-10" },
  },
  defaultVariants: { variant: "default", size: "default" },
});
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
));
Button.displayName = "Button";
