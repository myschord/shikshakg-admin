import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
const styles: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-dark",
  secondary: "border border-line bg-white text-ink hover:border-primary hover:text-primary",
  danger: "bg-error-fill text-white hover:bg-error-fill/90",
  ghost: "text-ink hover:bg-border-tint",
};

/** The console's one button. Desktop-first sizing, still 44px tall so it works on a tablet. */
export default function Button({
  variant = "primary",
  loading = false,
  icon,
  className = "",
  children,
  type = "button",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; icon?: React.ReactNode }) {
  return (
    <button
      type={type}
      {...rest}
      disabled={rest.disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${styles[variant]} ${className}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}
