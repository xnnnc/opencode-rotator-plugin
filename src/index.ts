import type { Plugin, PluginModule } from "@opencode-ai/plugin";

export const RotatorServerPlugin: Plugin = async () => {
  return {};
};

const pluginModule = {
  id: "opencode-rotator-plugin",
  server: RotatorServerPlugin,
} satisfies PluginModule;

export default pluginModule;
