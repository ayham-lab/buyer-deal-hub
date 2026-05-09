import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installLocationHeader } from "./lib/locationScope";

installLocationHeader();

createRoot(document.getElementById("root")!).render(<App />);
