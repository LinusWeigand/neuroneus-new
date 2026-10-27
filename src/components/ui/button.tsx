import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// DESIGN.md → button-primary (ink pill), button-outline (transparent pill, hairline-strong
// border), button-tertiary-text (inline ink text). Pill geometry on every CTA.

type Variant = "primary" | "outline" | "text";
type Size = "md" | "sm";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-on-primary active:bg-primary-active hover:bg-primary-active disabled:bg-muted-soft disabled:text-on-primary",
  outline:
    "bg-transparent text-ink border border-hairline-strong hover:border-ink active:bg-surface-strong disabled:text-muted-soft disabled:border-hairline",
  text: "bg-transparent text-ink hover:text-body-strong underline-offset-4 hover:underline disabled:text-muted-soft",
};

const sizes: Record<Size, Record<Variant, string>> = {
  md: { primary: "h-10 px-5", outline: "h-10 px-[19px]", text: "h-10 px-1" },
  sm: { primary: "h-8 px-3.5", outline: "h-8 px-3.5", text: "h-8 px-1" },
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill text-button transition-colors duration-150 select-none disabled:cursor-not-allowed",
    variants[variant],
    sizes[size][variant],
    extra,
  ].join(" ");
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size; icon?: ReactNode };

export function Button({ variant = "primary", size = "md", icon, className = "", children, ...props }: ButtonProps) {
  return (
    <button className={buttonClass(variant, size, className)} {...props}>
      {icon}
      {children}
    </button>
  );
}

type LinkButtonProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode };

export function LinkButton({ variant = "primary", size = "md", icon, className = "", children, ...props }: LinkButtonProps) {
  return (
    <Link className={buttonClass(variant, size, className)} {...props}>
      {icon}
      {children}
    </Link>
  );
}
