import { ReactNode } from "react";

interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: "up" | "down" | "neutral";
}

export default function MetricCard({
  label,
  value,
  subtitle,
  icon,
}: MetricCardProps) {
  return (
    <div className="rounded-lg border border-border-primary bg-bg-secondary p-4">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            {label}
          </p>
          <p className="text-2xl font-semibold tabular-nums text-text-primary">
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-text-secondary">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-bg-tertiary text-text-secondary">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
