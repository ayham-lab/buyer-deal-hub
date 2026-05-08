import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import Dashboard from "./Dashboard";

export default function Embed() {
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
        console.log("embed sso response:", data, invokeErr);
        if (invokeErr || !data || (data as any).error) return;

        const info = data as any;
        const locationId = info.ghl_location_id || info.locationId;
        const companyId = info.ghl_company_id || info.companyId;
        if (!locationId) return;

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
                ghl_company_id: companyId ?? null,
                ghl_location_name: null,
              },
              { onConflict: "user_id,ghl_location_id", ignoreDuplicates: true },
            );
          if (upErr) console.error("embed link upsert failed", upErr);
        } else {
          sessionStorage.setItem(
            "ghl_marketplace_pending_install",
            JSON.stringify({ locationId, companyId }),
          );
        }
      } catch (e) {
        console.error("embed sso processing failed", e);
      }
    };

    const handler = (event: MessageEvent) => {
      const payload = (event.data && (event.data as any).payload) as unknown;
      if (typeof payload === "string" && payload.length > 0) {
        console.log("embed received postMessage payload");
        processBlob(payload);
      }
    };

    window.addEventListener("message", handler);
    try {
      window.parent.postMessage({ message: "REQUEST_USER_DATA" }, "*");
    } catch (e) {
      console.error("postMessage to parent failed", e);
    }

    return () => {
      window.removeEventListener("message", handler);
    };
  }, []);

  return <Dashboard />;
}
