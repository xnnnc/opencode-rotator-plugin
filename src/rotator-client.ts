import type {
  CodexUsage,
  RotatorAction,
  RotatorApiActionResponse,
  RotatorApiStateResponse,
  RotatorPanelState,
  RotatorState,
} from "./types.js";

const DEFAULT_ROTATOR_URL = "http://127.0.0.1:4317";

export function getRotatorBaseUrl(): string {
  return (process.env.OPENCODE_ROTATOR_URL || DEFAULT_ROTATOR_URL).replace(/\/$/, "");
}

export async function fetchRotatorState(signal?: AbortSignal): Promise<RotatorState> {
  const init: RequestInit = {
    method: "GET",
    headers: { accept: "application/json" },
  };

  if (signal) {
    init.signal = signal;
  }

  const response = await fetch(`${getRotatorBaseUrl()}/api/state`, init);

  if (!response.ok) {
    throw new Error(`Rotator API failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as RotatorApiStateResponse;
  if (!payload.ok || !payload.state) {
    throw new Error("Rotator API returned an invalid state payload.");
  }

  return payload.state;
}

async function getActionRequest(action: RotatorAction, signal?: AbortSignal): Promise<{ path: string; body: Record<string, unknown> }> {
  switch (action) {
    case "usage":
      return { path: "/api/usage", body: {} };
    case "watch-toggle": {
      const state = await fetchRotatorState(signal);
      return state.watch.running
        ? { path: "/api/watch/stop", body: {} }
        : { path: "/api/watch/start", body: { intervalMs: 30_000 } };
    }
    case "switch-next":
      return { path: "/api/switch", body: {} };
  }
}

export async function runRotatorAction(action: RotatorAction, signal?: AbortSignal): Promise<RotatorApiActionResponse> {
  const request = await getActionRequest(action, signal);
  const token = process.env.OPENCODE_ROTATOR_TOKEN || process.env.ROTATOR_API_TOKEN || "";
  if (!token) {
    throw new Error("Rotator action token missing. Set OPENCODE_ROTATOR_TOKEN from the GUI server output.");
  }

  const init: RequestInit = {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-rotator-token": token,
    },
    body: JSON.stringify(request.body),
  };

  if (signal) {
    init.signal = signal;
  }

  const response = await fetch(`${getRotatorBaseUrl()}${request.path}`, init);
  const payload = (await response.json()) as RotatorApiActionResponse;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || payload.stderr || `Rotator action failed: ${response.status} ${response.statusText}`);
  }

  return payload;
}

function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? "n/a" : `${value}%`;
}

function formatPlanType(planType: string | null | undefined, fallback = "n/a"): string {
  if (!planType?.trim()) return fallback;
  return planType
    .trim()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function formatAccountLine(state: RotatorState): string {
  const active = state.accounts.find((account) => account.active) ?? state.accounts[state.activeIndex];
  if (!active) return "active: no account";
  const auth = active.inAuth ? "auth" : "noauth";
  return `active: #${active.index} ${truncate(active.label, 14)} ${active.status}/${auth}`;
}

function formatUsageLine(usage: CodexUsage | null | undefined): string {
  if (!usage) return "usage: no snapshot";
  if (usage.lastError) return `usage: ${usage.lastError}`;

  return `usage: 5h ${formatPercent(usage.primaryWindow?.usedPercent)} | 7d ${formatPercent(usage.secondaryWindow?.usedPercent)}`;
}

function formatPlanLine(usage: CodexUsage | null | undefined): string {
  return `plan: ${formatPlanType(usage?.planType)}`;
}

function formatWatchLine(state: RotatorState): string {
  const latestLog = [...state.watch.logs].reverse().find((entry) => entry.line.trim().length > 0)?.line.trim();
  if (latestLog) {
    if (state.watch.running && latestLog.startsWith("watch:")) return latestLog;
    if (!state.watch.running) return latestLog;
  }
  return state.watch.running ? `watch: on pid ${state.watch.pid ?? "?"}` : "watch: stopped";
}

export function buildPanelState(state: RotatorState): RotatorPanelState {
  const active = state.accounts.find((account) => account.active) ?? state.accounts[state.activeIndex];
  const lines = [
    formatAccountLine(state),
    formatPlanLine(active?.codexUsage),
    formatUsageLine(active?.codexUsage),
    formatWatchLine(state),
    `accounts: ${state.accounts.length}`,
  ];

  return { status: "ready", lines };
}

export function buildOfflinePanelState(error: unknown): RotatorPanelState {
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: "offline",
    lines: [
      "rotator server: offline",
      message,
      "",
      "start it from project root:",
      "npm run gui",
      "or open-gui.bat",
    ],
  };
}
