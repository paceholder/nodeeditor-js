import { createRoot } from "react-dom/client";
import { App } from "./app.js";

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing");
createRoot(root).render(<App />);
