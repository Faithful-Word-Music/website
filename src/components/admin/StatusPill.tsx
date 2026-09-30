import { cn } from "@/components/ui/cn";
import { REQUEST_STATUS_LABELS, type RequestStatus } from "@/lib/auth/request-status";

/** A small rounded label: request status, "Disabled", role names. */
export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "strong" | "muted" | "warning" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs",
        tone === "strong" && "border-ink bg-ink text-paper",
        tone === "neutral" && "border-line bg-surface text-ink",
        tone === "muted" && "border-line bg-paper text-muted",
        tone === "warning" && "border-gold-dark text-gold-dark",
      )}
    >
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status: RequestStatus }) {
  const tone = status === "pending" ? "strong" : status === "invited" || status === "active" ? "neutral" : "muted";
  return <Pill tone={tone}>{REQUEST_STATUS_LABELS[status]}</Pill>;
}
