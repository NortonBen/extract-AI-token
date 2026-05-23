import { defineConfig } from "wxt";
export default defineConfig({
  outDir: "dist",
  manifest: {
    name: "Extract Token",
    description: "Gemini multi-account tab controller",
    version: "0.0.4",
    permissions: ["storage", "tabs", "tabGroups", "scripting", "sidePanel"],
    host_permissions: ["https://gemini.google.com/*"],
    icons: {
      "16": "icon/16.png",
      "32": "icon/32.png",
      "48": "icon/48.png",
      "128": "icon/128.png"
    },
    action: {
      default_icon: {
        "16": "icon/16.png",
        "32": "icon/32.png",
        "48": "icon/48.png",
        "128": "icon/128.png"
      }
    },
    side_panel: {
      default_path: "sidepanel.html"
    }
  },
  modules: ["@wxt-dev/module-react"],
  srcDir: "."
});
