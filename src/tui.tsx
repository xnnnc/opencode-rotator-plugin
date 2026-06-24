/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { createSignal, onCleanup } from "solid-js";

import { buildOfflinePanelState, buildPanelState, fetchRotatorState, runRotatorAction } from "./rotator-client.js";
import type { RotatorAction, RotatorPanelState } from "./types.js";

const PLUGIN_ID = "opencode-rotator-plugin";
const SIDEBAR_ORDER = 155;
const REFRESH_INTERVAL_MS = 15_000;

type ActionButtonConfig = {
  action: RotatorAction;
  label: string;
  description: string;
};

const ACTION_BUTTONS: ActionButtonConfig[] = [
  { action: "usage", label: "u", description: "refresh usage" },
  { action: "watch-toggle", label: "w", description: "start / stop watch" },
  { action: "switch-next", label: "s", description: "switch next" },
];

function actionTitle(action: RotatorAction): string {
  switch (action) {
    case "usage":
      return "usage refresh";
    case "watch-toggle":
      return "watch toggle";
    case "switch-next":
      return "manual switch";
  }
}

function lineColor(line: string, status: RotatorPanelState["status"], api: TuiPluginApi) {
  const theme = api.theme.current;
  const usagePercent = Number(line.match(/\b(\d+(?:\.\d+)?)%/)?.[1]);
  if (status === "offline") return theme.error;
  if (["Active", "Usage", "Actions", "Last"].includes(line)) return theme.text;
  if (line.startsWith("  healthy")) return theme.success;
  if (usagePercent >= 90) return theme.error;
  if (usagePercent >= 75) return theme.warning;
  if (line.startsWith("  5h") || line.startsWith("  7d")) return theme.warning;
  return theme.textMuted;
}

function headerInfo(panel: RotatorPanelState): { status: string; pid: number | null; color: "error" | "success" | "textMuted" } {
  if (panel.status === "offline") return { status: "offline", pid: null, color: "error" };
  if (panel.status === "loading") return { status: "loading", pid: null, color: "textMuted" };
  return { status: panel.header.watchStatus, pid: panel.header.pid, color: panel.header.watchStatus === "watching" ? "success" : "textMuted" };
}

function headerText(panel: RotatorPanelState): string {
  const info = headerInfo(panel);
  return `Rotator ● ${info.status}${info.pid ? ` ● pid ${info.pid}` : ""}`;
}

function lastLine(message: string): string {
  return `  ${message.replace(/^last: /, "")}`;
}

function compactAccountLabel(message: string): string | null {
  const match = message.match(/Switched to "([^"]+)" \(index: (\d+)\)/);
  if (!match) return null;
  return `#${match[2]} ${match[1]}`;
}

function formatActionDetail(message: string | undefined): string {
  if (!message) return "done";
  const firstLine = message.split(/\r?\n/, 1)[0]?.trim();
  if (!firstLine) return "done";
  return compactAccountLabel(firstLine) ?? "done";
}

function formatErrorDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const firstLine = message.split(/\r?\n/, 1)[0]?.trim();
  if (!firstLine) return "unknown error";
  if (/token missing/i.test(firstLine)) return "token missing";
  if (/bad token|invalid rotator api token/i.test(firstLine)) return "bad token";
  if (/fetch failed|ECONNREFUSED|offline/i.test(firstLine)) return "server offline";
  return firstLine.length <= 24 ? firstLine : `${firstLine.slice(0, 23)}…`;
}

function ActionButton(props: {
  api: TuiPluginApi;
  config: ActionButtonConfig;
  description?: string;
  busy: boolean;
  onRun: (action: RotatorAction) => void;
}) {
  const theme = props.api.theme.current;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI has no button primitive; upstream examples use box onMouseUp for TUI buttons.
    <box
      height={1}
      gap={0}
      onMouseUp={() => {
        if (!props.busy) props.onRun(props.config.action);
      }}
    >
      <text fg={props.busy ? theme.textMuted : theme.primary} wrapMode="none">
        {`  [${props.config.label}] ${props.description ?? props.config.description}`}
      </text>
    </box>
  );
}

function HeaderLine(props: { api: TuiPluginApi; panel: RotatorPanelState }) {
  const theme = props.api.theme.current;
  const info = headerInfo(props.panel);
  return (
    <text fg={theme[info.color]} wrapMode="none">
      <b>{headerText(props.panel)}</b>
    </text>
  );
}

function SidebarRotatorPanel(props: { api: TuiPluginApi }) {
  const [panel, setPanel] = createSignal<RotatorPanelState>({ status: "loading", lines: ["loading rotator..."] });
  const [actionMessage, setActionMessage] = createSignal("ready");
  const [busy, setBusy] = createSignal(false);
  const abortController = new AbortController();
  let disposed = false;

  const reload = async () => {
    await fetchRotatorState(abortController.signal)
      .then((state) => {
        if (disposed) return;
        setPanel(buildPanelState(state));
      })
      .catch((error) => {
        if (disposed || abortController.signal.aborted) return;
        setPanel(buildOfflinePanelState(error));
      });
  };

  const runAction = (action: RotatorAction) => {
    if (busy()) return;

    setBusy(true);
    setActionMessage(`${actionTitle(action)} running`);

    void runRotatorAction(action, abortController.signal)
      .then((payload) => {
        if (disposed) return;
        if (payload.state) {
          setPanel(buildPanelState(payload.state));
        }
        const detail = formatActionDetail(payload.message || payload.stdout);
        setActionMessage(`last: ${actionTitle(action)} ok (${detail})`);
        if (!payload.state) {
          void reload();
        }
      })
      .catch((error) => {
        if (disposed || abortController.signal.aborted) return;
        setActionMessage(`last: ${actionTitle(action)} failed (${formatErrorDetail(error)})`);
        void reload();
      })
      .finally(() => {
        if (!disposed) setBusy(false);
      });
  };

  void reload();
  const interval = setInterval(() => void reload(), REFRESH_INTERVAL_MS);

  onCleanup(() => {
    disposed = true;
    abortController.abort();
    clearInterval(interval);
  });

  return (
    <box gap={0}>
      <HeaderLine api={props.api} panel={panel()} />
      <box gap={0}>
        {panel().lines.map((line) => (
          <text fg={lineColor(line, panel().status, props.api)} wrapMode="none">
            {line || " "}
          </text>
        ))}
      </box>
      <text fg={props.api.theme.current.text} wrapMode="none">
        Actions
      </text>
      <box gap={0}>
        {ACTION_BUTTONS.map((config) => {
          const description = config.action === "watch-toggle" ? `${headerInfo(panel()).status === "watching" ? "stop" : "start"} watch` : config.description;
          return <ActionButton api={props.api} config={config} description={description} busy={busy()} onRun={runAction} />;
        })}
      </box>
      <text fg={props.api.theme.current.text} wrapMode="none">
        Last
      </text>
      <text fg={busy() ? props.api.theme.current.warning : props.api.theme.current.success} wrapMode="none">
        {lastLine(actionMessage())}
      </text>
    </box>
  );
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: SIDEBAR_ORDER,
    slots: {
      sidebar_content() {
        return <SidebarRotatorPanel api={api} />;
      },
    },
  });
};

const pluginModule: TuiPluginModule & { id: string } = {
  id: PLUGIN_ID,
  tui,
};

export default pluginModule;
