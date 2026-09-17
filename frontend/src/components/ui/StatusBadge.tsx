interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

const STATUS_STYLES: Record<string, string> = {
  healthy: "bg-accent-green/15 text-accent-green",
  running: "bg-accent-green/15 text-accent-green",
  pass: "bg-accent-green/15 text-accent-green",
  completed: "bg-accent-green/15 text-accent-green",
  indexed: "bg-accent-green/15 text-accent-green",
  embedded: "bg-accent-green/15 text-accent-green",
  strong_evidence: "bg-accent-green/15 text-accent-green",
  sufficient_evidence: "bg-accent-blue/15 text-accent-blue",
  available: "bg-accent-green/15 text-accent-green",

  pending: "bg-text-muted/15 text-text-muted",
  processing: "bg-accent-amber/15 text-accent-amber",
  chunked: "bg-accent-amber/15 text-accent-amber",
  not_verified: "bg-text-muted/15 text-text-muted",

  weak_evidence: "bg-accent-amber/15 text-accent-amber",
  no_evidence: "bg-accent-red/15 text-accent-red",
  failed: "bg-accent-red/15 text-accent-red",
  fail: "bg-accent-red/15 text-accent-red",
  stale: "bg-accent-red/15 text-accent-red",
  error: "bg-accent-red/15 text-accent-red",
  offline: "bg-accent-red/15 text-accent-red",
  unavailable: "bg-accent-red/15 text-accent-red",
};

export default function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const style = STATUS_STYLES[status.toLowerCase()] ?? "bg-text-muted/15 text-text-muted";
  const sizeClass = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center rounded-md font-medium capitalize ${style} ${sizeClass}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
