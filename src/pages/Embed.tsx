import Dashboard from "./Dashboard";

// The GHL postMessage SSO handshake now lives in LocationProvider (App.tsx),
// so it runs on every route — not just /embed. This page is just the landing
// target GHL points its iframe at.
export default function Embed() {
  return <Dashboard />;
}
