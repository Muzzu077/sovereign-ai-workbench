export function LoadingSpinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16 gap-3">
      <div className="spinner" />
      <span className="text-sm text-text-muted">{label}</span>
    </div>
  );
}
