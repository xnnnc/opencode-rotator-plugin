export type CodexUsageWindow = {
  usedPercent: number | null;
  limitWindowSeconds: number | null;
  resetAt: number | null;
};

export type CodexUsage = {
  endpoint?: string;
  fetchedAt?: number;
  planType?: string | null;
  limitReached?: boolean;
  maxUsedPercent?: number | null;
  primaryWindow?: CodexUsageWindow | null;
  secondaryWindow?: CodexUsageWindow | null;
  lastError?: string | null;
};

export type RotatorAccount = {
  index: number;
  label: string;
  status: string;
  active: boolean;
  inAuth: boolean;
  accountId: string | null;
  cooldownUntil: number | null;
  disableReason: string | null;
  usageBlockedUntil: number | null;
  usageBlockReason: string | null;
  lastSwitchReason: string | null;
  codexUsage: CodexUsage | null;
};

export type WatchLogEntry = {
  at: number;
  line: string;
};

export type RotatorState = {
  activeIndex: number;
  authAccountId: string | null;
  authExists: boolean;
  accountsFile: string;
  authFile: string;
  accounts: RotatorAccount[];
  watch: {
    running: boolean;
    pid: number | null;
    logs: WatchLogEntry[];
  };
};

export type RotatorApiStateResponse = {
  ok: true;
  state: RotatorState;
};

export type RotatorApiActionResponse = {
  ok: boolean;
  code?: number;
  stdout?: string;
  stderr?: string;
  message?: string;
  error?: string;
  state?: RotatorState;
};

export type RotatorAction = "usage" | "watch-toggle" | "switch-next";

export type RotatorPanelState =
  | { status: "loading"; lines: string[] }
  | { status: "offline"; lines: string[] }
  | { status: "ready"; lines: string[] };
