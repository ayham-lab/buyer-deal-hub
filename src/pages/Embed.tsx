import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import Dashboard from "./Dashboard";

export default function Embed() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>("");
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

        if (invokeErr || !data || (data as any).error) {
          setError((data as any)?.error || invokeErr?.message || "SSO failed");
          setStatus("error");
          return;
        }

        const info = data as any;
        const locationId = info.ghl_location_id || info.locationId;
        const companyId = info.ghl_company_id || info.companyId;

        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;

        if (user && locationId) {
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

        setStatus("ready");
      } catch (e: any) {
        console.error("embed fatal", e);
        setError(e?.message ?? "Unexpected error");
        setStatus("error");
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

    const timeout = window.setTimeout(() => {
      if (!handledRef.current) {
        handledRef.current = true;
        setError("Missing SSO token in URL.");
        setStatus("error");
      }
    }, 10000);

    return () => {
      window.removeEventListener("message", handler);
      window.clearTimeout(timeout);
    };
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <div className="text-sm text-muted-foreground">Connecting to GoHighLevel...</div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-sm text-muted-foreground">Embed failed: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Dashboard />
    </div>
  );
}
