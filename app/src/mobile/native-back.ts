import type { AppPlugin } from "@capacitor/app";

type AndroidBackOptions = {
  app: AppPlugin;
  platform: string;
  canPop: () => boolean;
  pop: () => void;
};

export function installAndroidBackHandler({
  app,
  platform,
  canPop,
  pop,
}: AndroidBackOptions): () => Promise<void> {
  if (platform !== "android") {
    return async () => {};
  }

  const listener = app
    .addListener("backButton", () => {
      if (canPop()) {
        pop();
        return;
      }

      void app.exitApp();
    })
    .catch(() => null);

  return async () => {
    const handle = await listener;
    await handle?.remove();
  };
}
