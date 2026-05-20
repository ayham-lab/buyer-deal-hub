import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface ActiveLocation {
  locationId: string;
  companyId: string | null;
  userName?: string | null;
  email?: string | null;
  role?: string | null;
}

interface LocationContextValue {
  activeLocation: ActiveLocation | null;
  isIframed: boolean;
  /** True when standalone, OR when iframed AND the SSO handshake + iframe-signin have resolved. */
  handshakeReady: boolean;
  /** True while iframe-signin is in flight (prevents flash of standalone login). */
  iframeSigninPending: boolean;
  /** Clears active workspace + cached operator-group state. Used by "Admin view". */
  clearActiveLocation: () => void;
}

const LocationContext = createContext<LocationContextValue>({
  activeLocation: null,
  isIframed: false,
  handshakeReady: true,
  iframeSigninPending: false,
  clearActiveLocation: () => {},
});

export function useActiveLocation() {
  return useContext(LocationContext);
}

/**
 * Refreshes the operator-account aware effective-location cache used by
 * scopeToLocation() and LocationBadge. Idempotent + safe to call from
 * Settings after creating/editing a group.
 */
export async function refreshEffectiveLocations(activeLocationId: string | null) {
  if (!activeLocationId) {
    try {
      sessionStorage.removeItem("ghl_effective_locations");
      sessionStorage.removeItem("ghl_location_names");
    } catch {}
    return;
  }
  try {
    // Look up operator group for the active location.
    const { data: meTok } = await supabase
      .from("ghl_location_tokens")
      .select("operator_account_id")
      .eq("ghl_location_id", activeLocationId)
      .maybeSingle();
    const opId = (meTok as any)?.operator_account_id ?? null;

    let ids: string[] = [activeLocationId];
    let nameRows: any[] = [];

    if (opId) {
      const { data: sibs } = await supabase
        .from("ghl_location_tokens")
        .select("ghl_location_id, location_name")
        .eq("operator_account_id", opId);
      if (Array.isArray(sibs) && sibs.length > 0) {
        ids = Array.from(new Set(sibs.map((r: any) => r.ghl_location_id).filter(Boolean)));
        nameRows = sibs;
      }
    } else {
      const { data: self } = await supabase
        .from("ghl_location_tokens")
        .select("ghl_location_id, location_name")
        .eq("ghl_location_id", activeLocationId);
      nameRows = self || [];
    }

    const nameMap: Record<string, string> = {};
    nameRows.forEach((r: any) => {
      if (r.ghl_location_id) nameMap[r.ghl_location_id] = r.location_name || "";
    });

    try {
      sessionStorage.setItem("ghl_effective_locations", JSON.stringify(ids));
      sessionStorage.setItem("ghl_location_names", JSON.stringify(nameMap));
    } catch {}
  } catch (e) {
    console.error("refreshEffectiveLocations failed", e);
  }
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
  const [iframeSigninPending, setIframeSigninPending] = useState(false);
  const [iframeSigninDone, setIframeSigninDone] = useState(false);
  const isIframed = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();
  // Standalone is always "ready". Iframed: ready once activeLocation is set
  // AND the iframe-signin step has completed (or finished failing) so we
  // don't flash the standalone login form mid-handshake.
  const handshakeReady =
    !isIframed || (activeLocation !== null && !iframeSigninPending && iframeSigninDone);
  const handledRef = useRef(false);
  const navigate = useNavigate();

  // After the postMessage handshake lands on /embed, return to the original
  // deep-link the user (or GHL menu) was trying to reach.
  useEffect(() => {
    if (!activeLocation) return;
    if (window.location.pathname !== "/embed") return;
    let target: string | null = null;
    try {
      target = sessionStorage.getItem("ghl_post_handshake_return");
    } catch {}
    if (!target || target === "/embed") return;
    try {
      sessionStorage.removeItem("ghl_post_handshake_return");
    } catch {}
    pushDebug(`handshake done → returning to ${target}`);
    navigate(target, { replace: true });
  }, [activeLocation, navigate]);

  // Whenever active location changes, refresh the operator-group cache so
  // aggregated queries (scopeToLocation) and badges see siblings.
  useEffect(() => {
    refreshEffectiveLocations(activeLocation?.locationId ?? null);
  }, [activeLocation?.locationId]);

  const pushDebug = (msg: string) => {
    setDebugMessages((prev) => [...prev.slice(-9), `${new Date().toISOString().slice(11, 19)} ${msg}`]);
  };

  useEffect(() => {
    const processBlob = async (ssoToken: string) => {
      if (handledRef.current) return;
      handledRef.current = true;
      try {
        const { data, error: invokeErr } = await supabase.functions.invoke(
          "decrypt-ghl-sso",
          { body: { sso: ssoToken } },
        );
        console.log("LocationProvider decrypt-ghl-sso response:", data, invokeErr);
        if (invokeErr || (data as any)?.error) {
          const detail = (data as any)?.detail ?? (data as any)?.error ?? invokeErr?.message ?? "unknown";
          pushDebug(`decrypt failed: ${detail}`);
          setDebugStatus("decrypt failed");
          return;
        }
        if (!data) return;

        const info = data as any;
        const locationId = info.locationId;
        const companyId = info.companyId || null;
        if (!locationId) {
          pushDebug(`decrypt failed: no activeLocation in payload (keys=${Object.keys(info).join(",")})`);
          setDebugStatus("decrypt failed");
          return;
        }

        const next = {
          locationId,
          companyId,
          userName: info.userName ?? null,
          email: info.email ?? null,
          role: info.role ?? null,
        };
        try {
          sessionStorage.setItem("ghl_active_location", JSON.stringify(next));
        } catch {}
        setActiveLocation(next);
        pushDebug(`decrypted: ${locationId}`);
        setDebugStatus("active");

        const { data: { session } } = await supabase.auth.getSession();
        let user = session?.user ?? null;

        // Iframe-only: when there's no Supabase session (storage partitioned
        // away from standalone), mint one server-side using the SSO blob.
        // The edge function creates the auth user FIRST (if needed), then
        // upserts profile + ghl_location_links so downstream user_id refs
        // are consistent. Standalone never enters this branch.
        if (!user && isIframed) {
          let ssoBlob: string | null = null;
          try { ssoBlob = sessionStorage.getItem("ghl_sso_blob"); } catch {}
          if (ssoBlob) {
            setIframeSigninPending(true);
            try {
              const { data: signin, error: signinErr } = await supabase.functions.invoke(
                "iframe-signin",
                { body: { sso: ssoBlob } },
              );
              if (signinErr || !signin?.access_token || !signin?.refresh_token) {
                pushDebug(`iframe-signin failed: ${signinErr?.message ?? (signin as any)?.error ?? "unknown"}`);
              } else {
                const { data: setData, error: setErr } = await supabase.auth.setSession({
                  access_token: signin.access_token,
                  refresh_token: signin.refresh_token,
                });
                if (setErr) {
                  pushDebug(`setSession failed: ${setErr.message}`);
                } else {
                  user = setData.session?.user ?? null;
                  pushDebug(`iframe-signin ok: ${user?.id?.slice(0, 8) ?? "—"}`);
                }
              }
            } catch (e: any) {
              pushDebug(`iframe-signin threw: ${e?.message ?? e}`);
            } finally {
              setIframeSigninPending(false);
            }
          }
        }

        if (user) {
          // Resolve existing workspace owner for this location so that a
          // secondary user joining via iframe SSO doesn't accidentally claim
          // ownership. First user to install becomes the owner.
          const { data: existingLink } = await supabase
            .from("ghl_location_links")
            .select("workspace_owner_user_id")
            .eq("ghl_location_id", locationId)
            .limit(1)
            .maybeSingle();
          const ownerId = existingLink?.workspace_owner_user_id ?? user.id;

          const { error: upErr } = await supabase
            .from("ghl_location_links")
            .upsert(
              {
                user_id: user.id,
                workspace_owner_user_id: ownerId,
                linked_by_user_id: user.id,
                ghl_location_id: locationId,
                ghl_company_id: companyId,
                ghl_location_name: null,
              },
              { onConflict: "user_id,ghl_location_id", ignoreDuplicates: true },
            );
          if (upErr) console.error("LocationProvider link upsert failed", upErr);
          // location_memberships row is auto-created by the
          // sync_membership_from_ghl_link trigger on ghl_location_links INSERT.
        } else if (!isIframed) {
          sessionStorage.setItem(
            "ghl_marketplace_pending_install",
            JSON.stringify({ locationId, companyId }),
          );
        }
        // Mark iframe handshake fully complete (success or graceful fail) so
        // AppLayout stops showing the loading state. Standalone ignores this.
        setIframeSigninDone(true);
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
        // Stash the raw encrypted blob so iframe-mode edge function calls
        // (e.g. team-admin / invite-team-member) can re-decrypt server-side
        // to authenticate the GHL user without a Supabase session cookie.
        try { sessionStorage.setItem("ghl_sso_blob", ssoBlob); } catch {}
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

  const clearActiveLocation = () => {
    try {
      sessionStorage.removeItem("ghl_active_location");
      sessionStorage.removeItem("ghl_effective_locations");
      sessionStorage.removeItem("ghl_location_names");
    } catch {}
    setActiveLocation(null);
  };

  return (
    <LocationContext.Provider value={{ activeLocation, isIframed, handshakeReady, iframeSigninPending, clearActiveLocation }}>
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

