export function ErrorDisplay({
  error,
  retry,
}: {
  error: string;
  retry?: () => void;
}) {
  return (
    <div className="workstation-panel border-status-error/30 p-4 flex items-start gap-3">
      <div className="w-5 h-5 rounded-full bg-status-error/15 flex items-center justify-center shrink-0 mt-0.5">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-status-error">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-status-error font-medium">Error</p>
        <p className="text-xs text-text-secondary mt-0.5">{error}</p>
      </div>
      {retry && (
        <button onClick={retry} className="workstation-btn workstation-btn-secondary text-xs">
          Retry
        </button>
      )}
    </div>
  );
}
