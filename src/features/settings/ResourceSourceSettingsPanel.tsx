import type { ResourceSourceId } from "@/core/sources";
import type { ResourceSourceRuntimeStatus } from "@/features/settings/resourceSourceSettings";

export interface ResourceSourceSettingsPanelProps {
  statuses: ResourceSourceRuntimeStatus[];
  message: string;
  isBusy: boolean;
  onRefresh: () => void;
  onToggle: (sourceId: ResourceSourceId, enabled: boolean) => void;
}

function availabilityLabel(status: ResourceSourceRuntimeStatus): string {
  if (status.availability === "ready") {
    return status.enabled ? "可用" : "已关闭";
  }
  return "预留";
}

function credentialLabel(status: ResourceSourceRuntimeStatus): string {
  if (status.credentialMode === "optional") {
    return "凭据可选";
  }
  if (status.credentialMode === "required") {
    return "需凭据";
  }
  return "无需凭据";
}

export function ResourceSourceSettingsPanel({
  statuses,
  message,
  isBusy,
  onRefresh,
  onToggle,
}: ResourceSourceSettingsPanelProps) {
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">资料源</div>
        <button
          className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-muted)] disabled:opacity-50"
          disabled={isBusy}
          onClick={onRefresh}
          type="button"
        >
          刷新
        </button>
      </div>

      <div className="mt-3 space-y-2 rounded-md border border-[var(--color-border)] p-3">
        {statuses.map((status) => (
          <label
            className="flex items-start gap-3 rounded-md border border-[var(--color-border)] p-3"
            key={status.id}
          >
            <input
              checked={status.enabled}
              className="mt-1"
              disabled={isBusy}
              onChange={(event) => onToggle(status.id, event.target.checked)}
              type="checkbox"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-[var(--color-ink)]">
                  {status.label}
                </span>
                <span className="shrink-0 rounded bg-[var(--color-soft)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
                  {availabilityLabel(status)}
                </span>
              </span>
              <span className="mt-1 block text-xs leading-5 text-[var(--color-muted)]">
                {credentialLabel(status)} · {status.detail}
              </span>
            </span>
          </label>
        ))}
        <div className="text-sm text-[var(--color-muted)]">{message}</div>
      </div>
    </div>
  );
}
