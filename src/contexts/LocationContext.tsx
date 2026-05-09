import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface ActiveLocation {
  locationId: string;
  companyId: string | null;
}

interface LocationContextValue {
  activeLocation: ActiveLocation | null;
}

const LocationContext = createContext<LocationContextValue>({ activeLocation: null });

export function useActiveLocation() {
  return useContext(LocationContext);
}

/**
 * Listens for the GHL parent-frame postMessage SSO handshake on EVERY route
 * (not just /embed), so any deep-linked page inside the GHL iframe can scope
 * itself to the active sub-account via sessionStorage.ghl_active_location.
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  const [activeLocation, setActiveLocation] = useState<ActiveLocation | null>(() => {
    try {
      const raw = sessionStorage.getItem("ghl_active_location");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [debugMessages, setDebugMessages] = useState<string[]>([]);
  const [debugStatus, setDebugStatus] = useState<string>("waiting for postMessage…");
  const handledRef = useRef(false);

  const pushDebug = (msg: string) => {
    setDebugMessages((prev) => [...prev.slice(-9), `${new Date().toISOString().slice(11, 19)} ${msg}`]);
  };

  useEffect(() => {
    const processBlob = async (ssoToken: string) => {
      if (handledRef.current) return;
      handledRef.current = true;
      try {
        const { data, error: invokeErr } = await supabase.functions.invoke(
          "oauth-userinfo",
          { body: { sso: ssoToken } },
        );
        console.log("LocationProvider sso response:", data, invokeErr);
        if (invokeErr || (data as any)?.error) {
          pushDebug(`SSO decrypt error: ${invokeErr?.message ?? (data as any)?.error}`);
          setDebugStatus("SSO decrypt failed");
          return;
        }
        if (!data) return;

        const info = data as any;
        const locationId = info.ghl_location_id || info.locationId;
        const companyId = info.ghl_company_id || info.companyId || null;
        if (!locationId) {
          pushDebug(`SSO returned no locationId. keys=${Object.keys(info).join(",")}`);
          setDebugStatus("SSO returned no locationId");
          return;
        }

        const next = { locationId, companyId };
        try {
          sessionStorage.setItem("ghl_active_location", JSON.stringify(next));
        } catch {}
        setActiveLocation(next);
        pushDebug(`SSO ok → location ${locationId}`);
        setDebugStatus("active");

        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (user) {
          const { error: upErr } = await supabase
            .from("ghl_location_links")
            .upsert(
              {
                user_id: user.id,
                workspace_owner_user_id: user.id,
                linked_by_user_id: user.id,
                ghl_location_id: locationId,
                ghl_company_id: companyId,
                ghl_location_name: null,
              },
              { onConflict: "user_id,ghl_location_id", ignoreDuplicates: true },
            );
          if (upErr) console.error("LocationProvider link upsert failed", upErr);
        } else {
          sessionStorage.setItem(
            "ghl_marketplace_pending_install",
            JSON.stringify({ locationId, companyId }),
          );
        }
      } catch (e) {
        console.error("LocationProvider sso processing failed", e);
      }
    };

    const handler = (event: MessageEvent) => {
      // Log the entire payload so we can see the exact shape GHL is sending.
      try {
        console.log("LocationProvider postMessage e.data:", event.data);
      } catch {}

      const data: any = event.data ?? {};
      let preview: string;
      try {
        preview = typeof data === "string" ? data.slice(0, 80) : JSON.stringify(data).slice(0, 120);
      } catch {
        preview = String(data);
      }
      pushDebug(`msg from ${event.origin}: ${preview}`);

      // 1) Encrypted SSO blob path
      const ssoBlob =
        typeof data.payload === "string" && data.payload.length > 0
          ? data.payload
          : typeof data.sso === "string" && data.sso.length > 0
            ? data.sso
            : null;
      if (ssoBlob) {
        pushDebug("→ SSO blob, decrypting…");
        setDebugStatus("decrypting SSO");
        processBlob(ssoBlob);
        return;
      }

      // 2) Plain activeLocation path
      const candidates = [
        data.activeLocation,
        data.payload?.activeLocation,
        data.payload && typeof data.payload === "object" ? data.payload : null,
        data,
      ].filter(Boolean);

      for (const c of candidates) {
        const locationId = c.locationId || c.id || c.location_id;
        const companyId = c.companyId || c.company_id || null;
        if (typeof locationId === "string" && locationId.length > 0) {
          if (handledRef.current) return;
          handledRef.current = true;
          const next = { locationId, companyId };
          try {
            sessionStorage.setItem("ghl_active_location", JSON.stringify(next));
          } catch {}
          setActiveLocation(next);
          pushDebug(`→ plain activeLocation ${locationId}`);
          setDebugStatus("active");
          return;
        }
      }
    };

    window.addEventListener("message", handler);

    const isIframed = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();
    pushDebug(`mounted. iframed=${isIframed} path=${window.location.pathname}`);
    if (isIframed) {
      // GHL only injects activeLocation into iframes whose URL it recognizes
      // as the app's custom-page (/embed). If we're deep-linked anywhere else
      // inside the iframe, stash the original deep-link, hard-navigate to
      // /embed (so GHL fires the handshake), then return there once we have
      // the active location.
      if (window.location.pathname !== "/embed") {
        const original = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        try {
          sessionStorage.setItem("ghl_post_handshake_return", original);
        } catch {}
        const target = `/embed${window.location.search}${window.location.hash}`;
        pushDebug(`iframed but not /embed → redirecting to ${target} (return=${original})`);
        window.location.replace(target);
        return;
      }
      try {
        window.parent.postMessage({ message: "REQUEST_USER_DATA" }, "*");
        pushDebug("posted REQUEST_USER_DATA to parent");
      } catch (e: any) {
        pushDebug(`postMessage failed: ${e?.message ?? e}`);
        console.error("postMessage to parent failed", e);
      }
    } else {
      setDebugStatus("not iframed (standalone)");
    }

    return () => {
      window.removeEventListener("message", handler);
    };
  }, []);

  return (
    <LocationContext.Provider value={{ activeLocation }}>
      {children}
      <DebugOverlay
        status={debugStatus}
        activeLocation={activeLocation}
        messages={debugMessages}
      />
    </LocationContext.Provider>
  );
}

function DebugOverlay({
  status,
  activeLocation,
  messages,
}: {
  status: string;
  activeLocation: ActiveLocation | null;
  messages: string[];
}) {
  const [open, setOpen] = useState(true);
  return (
    <div
      style={{
        position: "fixed",
        bottom: 8,
        right: 8,
        zIndex: 99999,
        maxWidth: 420,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        background: "rgba(0,0,0,0.85)",
        color: "#0f0",
        border: "1px solid #0f0",
        borderRadius: 6,
        padding: 8,
        pointerEvents: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong style={{ color: "#fff" }}>GHL Location Debug</strong>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{ background: "transparent", color: "#fff", border: "1px solid #555", borderRadius: 4, padding: "0 6px", cursor: "pointer" }}
        >
          {open ? "−" : "+"}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 6 }}>
          <div>status: <span style={{ color: "#ff0" }}>{status}</span></div>
          <div>
            activeLocation: <span style={{ color: "#ff0" }}>
              {activeLocation ? `${activeLocation.locationId} / ${activeLocation.companyId ?? "—"}` : "null"}
            </span>
          </div>
          <div style={{ marginTop: 6, borderTop: "1px solid #333", paddingTop: 6, maxHeight: 200, overflow: "auto" }}>
            {messages.length === 0 ? (
              <div style={{ opacity: 0.6 }}>no messages yet…</div>
            ) : (
              messages.map((m, i) => <div key={i}>{m}</div>)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

