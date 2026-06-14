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
  { action: "usage", label: "usage", description: "refresh snapshots" },
  { action: "watch-toggle", label: "watch", description: "start / stop" },
  { action: "switch-next", label: "switch", description: "next healthy" },
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
  if (status === "offline") return theme.error;
  if (line.startsWith("active:")) return theme.text;
  if (line.startsWith("plan:")) return theme.textMuted;
  if (line.startsWith("usage:")) return theme.warning;
  if (line.startsWith("watch: on pid")) return theme.success;
  if (line.startsWith("watch: stopped") || line.startsWith("watch: idle")) return theme.textMuted;
  if (line.startsWith("last:")) return theme.success;
  return theme.textMuted;
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
  return firstLine.length <= 42 ? firstLine : `${firstLine.slice(0, 41)}…`;
}

function ActionButton(props: {
  api: TuiPluginApi;
  config: ActionButtonConfig;
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
        {`  [${props.config.label}] ${props.config.description}`}
      </text>
    </box>
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
      <text fg={props.api.theme.current.text}>
        <b>Rotator</b>
      </text>
      <box gap={0}>
        <text fg={props.api.theme.current.textMuted} wrapMode="none">
          actions
        </text>
        {ACTION_BUTTONS.map((config) => (
          <ActionButton api={props.api} config={config} busy={busy()} onRun={runAction} />
        ))}
        <text fg={busy() ? props.api.theme.current.warning : props.api.theme.current.success} wrapMode="none">
          {actionMessage()}
        </text>
      </box>
      <box gap={0}>
        {panel().lines.map((line) => (
          <text fg={lineColor(line, panel().status, props.api)} wrapMode="none">
            {line || " "}
          </text>
        ))}
      </box>
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
