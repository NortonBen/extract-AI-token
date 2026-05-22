import { defineConfig } from "wxt";
export default defineConfig({
  outDir: "dist",
  manifest: {
    name: "AI Browser Control",
    description: "Gemini multi-account tab controller",
    version: "0.1.0",
    permissions: ["storage", "tabs", "tabGroups", "scripting", "sidePanel"],
    host_permissions: ["https://gemini.google.com/*"],
    side_panel: {
      default_path: "sidepanel.html"
    }
  },
  modules: ["@wxt-dev/module-react"],
  srcDir: "."
});
