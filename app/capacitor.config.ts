import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.nanen9396.cuotiji",
  appName: "错题集",
  webDir: "dist/native",
  plugins: {
    SystemBars: {
      insetsHandling: "css",
    },
  },
};

export default config;
