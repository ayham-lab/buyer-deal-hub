import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
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
        if (invokeErr || !data || (data as any).error) return;

        const info = data as any;
        const locationId = info.ghl_location_id || info.locationId;
        const companyId = info.ghl_company_id || info.companyId || null;
        if (!locationId) return;

        const next = { locationId, companyId };
        try {
          sessionStorage.setItem("ghl_active_location", JSON.stringify(next));
        } catch {}
        setActiveLocation(next);

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

      // 1) Encrypted SSO blob path — GHL sends { payload: "<encrypted-string>" }
      //    in response to REQUEST_USER_DATA. Decrypt via oauth-userinfo.
      const ssoBlob =
        typeof data.payload === "string" && data.payload.length > 0
          ? data.payload
          : typeof data.sso === "string" && data.sso.length > 0
            ? data.sso
            : null;
      if (ssoBlob) {
        console.log("LocationProvider received SSO blob");
        processBlob(ssoBlob);
        return;
      }

      // 2) Plain activeLocation path — some GHL contexts post the location
      //    directly without the encrypted blob. Check both nesting shapes:
      //      { activeLocation: { id, companyId } }
      //      { payload: { activeLocation: { id, companyId } } }
      //      { payload: { locationId, companyId } }
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
          console.log("LocationProvider received plain activeLocation:", { locationId, companyId });
          if (handledRef.current) return;
          handledRef.current = true;
          const next = { locationId, companyId };
          try {
            sessionStorage.setItem("ghl_active_location", JSON.stringify(next));
          } catch {}
          setActiveLocation(next);
          return;
        }
      }
    };

    window.addEventListener("message", handler);

    // Only request from parent if we're actually framed (iframe inside GHL).
    const isIframed = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();
    if (isIframed) {
      try {
        window.parent.postMessage({ message: "REQUEST_USER_DATA" }, "*");
      } catch (e) {
        console.error("postMessage to parent failed", e);
      }
    }

    return () => {
      window.removeEventListener("message", handler);
    };
  }, []);

  return (
    <LocationContext.Provider value={{ activeLocation }}>
      {children}
    </LocationContext.Provider>
  );
}
