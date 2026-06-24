import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import type {
  CodexUsage,
  RotatorAction,
  RotatorApiActionResponse,
  RotatorApiStateResponse,
  RotatorPanelState,
  RotatorState,
} from "./types.js";

const DEFAULT_ROTATOR_URL = "http://127.0.0.1:4317";
const ROTATOR_APP_NAME = "opencode-chatgpt-account-rotator";

export function getRotatorBaseUrl(): string {
  return (process.env.OPENCODE_ROTATOR_URL || DEFAULT_ROTATOR_URL).replace(/\/$/, "");
}

function userConfigDir(appName = ROTATOR_APP_NAME): string {
  if (process.env.ROTATOR_CONFIG_DIR) return resolve(process.env.ROTATOR_CONFIG_DIR);
  if (process.platform === "win32") return resolve(process.env.APPDATA || resolve(homedir(), "AppData/Roaming"), appName);
  if (process.platform === "darwin") return resolve(homedir(), "Library/Application Support", appName);
  return resolve(process.env.XDG_CONFIG_HOME || resolve(homedir(), ".config"), appName);
}

function readTokenFile(): string {
  const tokenFile = resolve(userConfigDir(), "api-token");
  if (!existsSync(tokenFile)) return "";
  return readFileSync(tokenFile, "utf8").trim();
}

function getActionToken(): string {
  return process.env.OPENCODE_ROTATOR_TOKEN || process.env.ROTATOR_API_TOKEN || readTokenFile();
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

function describeActionError(response: Response, payload: RotatorApiActionResponse | null): string {
  const detail = payload?.error || payload?.stderr || response.statusText;
  if (response.status === 403 && /token/i.test(detail)) return "bad token";
  return detail ? `${response.status} ${detail}` : `Rotator action failed: ${response.status}`;
}

async function readActionResponse(response: Response): Promise<RotatorApiActionResponse | null> {
  const text = await response.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as RotatorApiActionResponse;
  } catch {
    return { ok: false, error: text.trim() };
  }
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
  const token = getActionToken();
  if (!token) {
    throw new Error("token missing");
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
  const payload = await readActionResponse(response);

  if (!response.ok || !payload?.ok) {
    throw new Error(describeActionError(response, payload));
  }

  return payload;
}

function formatUsagePercent(value: number | null | undefined): string {
  return value === null || value === undefined ? " n/a" : `${String(value).padStart(3, " ")}%`;
}

function usageBar(value: number | null | undefined): string {
  if (value === null || value === undefined) return "░░░░░░░░░░░░░░░";
  const filled = Math.max(0, Math.min(15, Math.round((value / 100) * 15)));
  return `${"█".repeat(filled)}${"░".repeat(15 - filled)}`;
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
  return `  #${active.index} ${truncate(active.label, 28)}`;
}

function formatAccountStatusLine(active: RotatorState["accounts"][number] | undefined): string {
  if (!active) return "  no account";
  const auth = active.inAuth ? "auth" : "noauth";
  return `  ${active.status} · ${auth}`;
}

function formatGroupLine(active: RotatorState["accounts"][number] | undefined): string {
  const group = active?.group?.trim() || "ungrouped";
  return `  Group: ${truncate(group, 20)}`;
}

function formatPlanLine(active: RotatorState["accounts"][number] | undefined): string {
  return `  Plan: ${formatPlanType(active?.codexUsage?.planType)}`;
}

function formatUsageLines(usage: CodexUsage | null | undefined): string[] {
  if (!usage) return ["  no snapshot"];
  if (usage.lastError) return [`  ${usage.lastError}`];

  return [
    `  5h ${formatUsagePercent(usage.primaryWindow?.usedPercent)}  ${usageBar(usage.primaryWindow?.usedPercent)}`,
    `  7d ${formatUsagePercent(usage.secondaryWindow?.usedPercent)}  ${usageBar(usage.secondaryWindow?.usedPercent)}`,
  ];
}

export function buildPanelState(state: RotatorState): RotatorPanelState {
  const active = state.accounts.find((account) => account.active) ?? state.accounts[state.activeIndex];
  const lines = [
    "Active",
    formatAccountLine(state),
    formatAccountStatusLine(active),
    formatGroupLine(active),
    formatPlanLine(active),
    "",
    "Usage",
    ...formatUsageLines(active?.codexUsage),
  ];

  return { status: "ready", lines, header: { watchStatus: state.watch.running ? "watching" : "ready", pid: state.watch.pid } };
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
