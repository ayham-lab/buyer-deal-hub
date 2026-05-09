// GHL Custom Pages SSO decryption.
// Per https://marketplace.gohighlevel.com/docs/other/user-context-marketplace-apps
// the parent posts { message: "REQUEST_USER_DATA_RESPONSE", payload: <encrypted> }
// where `payload` is a CryptoJS.AES.encrypt(JSON.stringify(userData), SHARED_SECRET)
// string. CryptoJS uses OpenSSL-compatible format: base64 of
// "Salted__" + 8-byte salt + ciphertext, with key+iv derived via EVP_BytesToKey (MD5).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function md5(bytes: Uint8Array): Uint8Array {
  // Minimal MD5 implementation (returns 16 bytes).
  function toBytes(n: number) {
    return new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
  }
  const msg = Array.from(bytes);
  const origLen = msg.length;
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  const bitLen = BigInt(origLen) * 8n;
  for (let i = 0; i < 8; i++) msg.push(Number((bitLen >> BigInt(i * 8)) & 0xffn));

  const K = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ];
  const R = [
    7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
    5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
    4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
    6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21,
  ];
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476;
  const rl = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0;

  for (let i = 0; i < msg.length; i += 64) {
    const M = new Array(16);
    for (let j = 0; j < 16; j++) {
      M[j] = msg[i + j*4] | (msg[i + j*4 + 1] << 8) | (msg[i + j*4 + 2] << 16) | (msg[i + j*4 + 3] << 24);
    }
    let a = h0, b = h1, c = h2, d = h3;
    for (let j = 0; j < 64; j++) {
      let f: number, g: number;
      if (j < 16) { f = (b & c) | ((~b) & d); g = j; }
      else if (j < 32) { f = (d & b) | ((~d) & c); g = (5*j + 1) % 16; }
      else if (j < 48) { f = b ^ c ^ d; g = (3*j + 5) % 16; }
      else { f = c ^ (b | (~d)); g = (7*j) % 16; }
      const tmp = d;
      d = c; c = b;
      b = (b + rl((a + f + K[j] + M[g]) >>> 0, R[j])) >>> 0;
      a = tmp;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
  }
  const out = new Uint8Array(16);
  out.set(toBytes(h0), 0); out.set(toBytes(h1), 4);
  out.set(toBytes(h2), 8); out.set(toBytes(h3), 12);
  return out;
}

function evpBytesToKey(passphrase: Uint8Array, salt: Uint8Array, keyLen: number, ivLen: number) {
  const out = new Uint8Array(keyLen + ivLen);
  let prev = new Uint8Array(0);
  let written = 0;
  while (written < out.length) {
    const buf = new Uint8Array(prev.length + passphrase.length + salt.length);
    buf.set(prev, 0);
    buf.set(passphrase, prev.length);
    buf.set(salt, prev.length + passphrase.length);
    prev = md5(buf);
    out.set(prev.subarray(0, Math.min(prev.length, out.length - written)), written);
    written += prev.length;
  }
  return { key: out.subarray(0, keyLen), iv: out.subarray(keyLen, keyLen + ivLen) };
}

async function decryptCryptoJsAes(b64: string, passphrase: string): Promise<any> {
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (raw.length < 16 || String.fromCharCode(...raw.subarray(0, 8)) !== "Salted__") {
    throw new Error("Payload is not in CryptoJS OpenSSL format (missing Salted__ prefix)");
  }
  const salt = raw.subarray(8, 16);
  const ct = raw.subarray(16);
  const { key, iv } = evpBytesToKey(new TextEncoder().encode(passphrase), salt, 32, 16);
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "AES-CBC" }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, cryptoKey, ct);
  return JSON.parse(new TextDecoder().decode(plain));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { sso } = await req.json();
    if (!sso || typeof sso !== "string") {
      return j({ error: "Missing sso token" }, 400);
    }
    const key = Deno.env.get("GHL_APP_SSO_KEY");
    if (!key) {
      return j({ error: "GHL_APP_SSO_KEY not configured", hint: "Add the GHL App Shared Secret as GHL_APP_SSO_KEY." }, 500);
    }
    const payload = await decryptCryptoJsAes(sso, key);
    // GHL user-context payload fields: userId, companyId, role, type, userName,
    // email, activeLocation (string), planId, etc.
    return j({
      locationId: payload.activeLocation || payload.locationId || null,
      companyId: payload.companyId || null,
      userId: payload.userId || null,
      userName: payload.userName || null,
      email: payload.email || null,
      role: payload.role || null,
      type: payload.type || null,
      raw: payload,
    });
  } catch (err) {
    return j({ error: "Failed to decrypt SSO token", detail: String(err) }, 400);
  }
});

function j(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
