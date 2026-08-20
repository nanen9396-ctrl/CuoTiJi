import { Capacitor } from "@capacitor/core";
import { MobileRuntime, ProductionRuntime } from "./mobile";
import Prototype from "./Prototype";

export default function App() {
  const nativeShell = Capacitor.isNativePlatform()
    || new URLSearchParams(window.location.search).get("shell") === "native";

  if (!nativeShell) return <MobileRuntime><Prototype /></MobileRuntime>;

  const platform = Capacitor.getPlatform() === "android" ? "android" : "ios";
  return <ProductionRuntime platform={platform}><Prototype /></ProductionRuntime>;
}
