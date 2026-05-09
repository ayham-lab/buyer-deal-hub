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
  const handledRef = useRef(false);

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
      const payload = (event.data && (event.data as any).payload) as unknown;
      if (typeof payload === "string" && payload.length > 0) {
        console.log("LocationProvider received postMessage payload");
        processBlob(payload);
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
