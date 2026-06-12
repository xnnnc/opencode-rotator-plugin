type ServerPluginModule = {
  id: string;
  server: () => Record<string, never>;
};

function RotatorServerPlugin(): Record<string, never> {
  return {};
}

const pluginModule = {
  id: "opencode-rotator-plugin",
  server: RotatorServerPlugin,
} satisfies ServerPluginModule;

export default pluginModule;
