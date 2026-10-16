import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.nanen9396.ticang",
  appName: "题仓",
  webDir: "dist/native",
  plugins: {
    SystemBars: {
      insetsHandling: "css",
    },
  },
};

export default config;
