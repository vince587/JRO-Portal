import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const neuBase =
  "rounded-xl bg-[var(--neu-bg)] text-[#3a4456] border border-[#d3d9e3] " +
  "shadow-[6px_6px_12px_var(--neu-shadow-dark),-6px_-6px_12px_var(--neu-shadow-light)] " +
  "hover:shadow-[8px_8px_16px_var(--neu-shadow-dark),-8px_-8px_16px_var(--neu-shadow-light)] " +
  "active:shadow-[inset_4px_4px_8px_var(--neu-shadow-dark),inset_-4px_-4px_8px_var(--neu-shadow-light)] active:bg-[linear-gradient(180deg,hsl(var(--accent)/0.35),hsl(var(--accent)/0.15))]"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Neumorphism: soft extruded look on a light, low-contrast surface.
        neu: neuBase,
        default:
           // @replit: neumorphism + primary accent text
           neuBase + " text-primary font-semibold",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm border-destructive-border active:bg-[linear-gradient(180deg,hsl(var(--destructive)),hsl(var(--destructive)/0.8))] active:shadow-inner",
        outline:
          // Neumorphism outline button (inherits current text color).
          neuBase,
        secondary:
          // @replit neumorphism secondary.
          neuBase + " text-secondary-foreground",
        // @replit no hover, transparent border
        ghost: "border border-transparent hover:bg-accent hover:text-accent-foreground active:bg-[linear-gradient(180deg,hsl(var(--accent)),hsl(var(--accent)/0.85))]",
        link: "text-primary underline-offset-4 hover:underline active:text-primary/80",
      },
      size: {
        // @replit changed sizes
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 text-xs",
        lg: "min-h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "neu",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {asChild ? children : (
          <>
            {loading && (
              <svg
                className="mr-2 h-4 w-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            {children}
          </>
        )}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }