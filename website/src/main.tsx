import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyRuntimeParamsAndCleanUrl } from "./lib/runtimeConfig";

const redirected = applyRuntimeParamsAndCleanUrl();
if (!redirected) {
  createRoot(document.getElementById("root")!).render(<App />);
}
