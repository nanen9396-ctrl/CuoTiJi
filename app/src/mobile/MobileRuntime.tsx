import { useEffect, type PropsWithChildren } from "react";
import { MobileDeviceProvider, useMobileDevice } from "./Device";
import { KeyboardDock, KeyboardProvider, useKeyboard } from "./Keyboard";
import { PhoneFrame } from "./PhoneFrame";
import { HomeIndicator, StatusBar } from "./components";

export function MobileRuntime({ children }: PropsWithChildren) {
  return (
    <MobileDeviceProvider>
      <PhoneFrame>
        <KeyboardProvider>
          <KeyboardPreview />
          <StatusBar />
          <MobileAppViewport>{children}</MobileAppViewport>
          <HomeIndicator />
          <KeyboardDock />
        </KeyboardProvider>
      </PhoneFrame>
    </MobileDeviceProvider>
  );
}

export function ProductionRuntime({ children, platform }: PropsWithChildren<{ platform: "ios" | "android" }>) {
  return (
    <MobileDeviceProvider initialDeviceId={platform === "android" ? "pixel-10" : "iphone"}>
      <KeyboardProvider simulated={false}>
        <div className="native-app-viewport" data-platform={platform}>
          {children}
        </div>
      </KeyboardProvider>
    </MobileDeviceProvider>
  );
}

function MobileAppViewport({ children }: PropsWithChildren) {
  const { device } = useMobileDevice();
  const keyboard = useKeyboard();

  return (
    <div
      className="mobile-app-viewport"
      data-keyboard-visible={keyboard.visible ? "true" : "false"}
      data-platform={device.platform}
      data-testid="mobile-app-viewport"
    >
      {children}
    </div>
  );
}

function KeyboardPreview() {
  const keyboard = useKeyboard();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("keyboard") === "1") {
      keyboard.show();
    }
  }, [keyboard]);

  return null;
}
