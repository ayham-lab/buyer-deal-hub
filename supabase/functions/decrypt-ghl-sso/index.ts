import { corsHeaders } from "@supabase/supabase-js/cors";

// GHL SSO decryption: GHL encrypts the SSO payload using AES-256-CBC with the
// GHL_APP_SSO_KEY shared secret. The token format is "iv:ciphertext" hex-encoded
// (per GHL marketplace docs). We decrypt and return { locationId, userId, ... }.

async function decryptGhlSso(token: string, key: string): Promise<any> {
  // GHL uses AES-256-CBC. Token is base64 with iv prefixed (16 bytes).
  // Reference: GHL marketplace SSO docs.
  const raw = Uint8Array.from(atob(token), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 16);
  const ct = raw.slice(16);
  const keyBytes = new TextEncoder().encode(key).slice(0, 32);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-CBC" },
    false,
    ["decrypt"],
  );
  const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, cryptoKey, ct);
  return JSON.parse(new TextDecoder().decode(plain));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { sso } = await req.json();
    if (!sso || typeof sso !== "string") {
      return new Response(JSON.stringify({ error: "Missing sso token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const key = Deno.env.get("GHL_APP_SSO_KEY");
    if (!key) {
      return new Response(
        JSON.stringify({
          error: "GHL_APP_SSO_KEY not configured",
          hint: "Add the GHL_APP_SSO_KEY secret in backend settings.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const payload = await decryptGhlSso(sso, key);

    return new Response(
      JSON.stringify({
        locationId: payload.activeLocation || payload.locationId,
        userId: payload.userId,
        userName: payload.userName,
        email: payload.email,
        companyId: payload.companyId,
        type: payload.type,
        raw: payload,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Failed to decrypt SSO token", detail: String(err) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
