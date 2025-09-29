import type { Env } from "./types";

export interface WebPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface WebPushRequest {
  device: {
    deviceId: string;
    subscription: WebPushSubscription;
  };
  item: {
    itemId: string;
    url: string;
    sentAt: string;
  };
}

export interface WebPushResult {
  ok: boolean;
}

const textEncoder = new TextEncoder();

const toBase64 = (data: Uint8Array): string => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(data).toString("base64");
  }
  let binary = "";
  data.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const fromBase64 = (input: string): Uint8Array => {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(input, "base64"));
  }
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const base64UrlEncode = (data: Uint8Array): string =>
  toBase64(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const base64UrlDecode = (input: string): Uint8Array => {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return fromBase64(normalized);
};

const concatUint8 = (...chunks: Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
};

const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info
    },
    key,
    length * 8
  );
  return new Uint8Array(derived);
};

const encodeLength = (value: Uint8Array): Uint8Array => {
  const view = new DataView(new ArrayBuffer(2));
  view.setUint16(0, value.length, false);
  return concatUint8(new Uint8Array(view.buffer), value);
};

const createInfo = (type: string, clientPublicKey: Uint8Array, serverPublicKey: Uint8Array): Uint8Array => {
  const typeBuffer = textEncoder.encode(`Content-Encoding: ${type}\0`);
  const curveBuffer = textEncoder.encode("P-256\0");
  return concatUint8(typeBuffer, curveBuffer, encodeLength(clientPublicKey), encodeLength(serverPublicKey));
};

const derToJose = (signature: ArrayBuffer): string => {
  const bytes = new Uint8Array(signature);
  if (bytes.length === 64) {
    return base64UrlEncode(bytes);
  }
  let offset = 0;

  if (bytes[offset++] !== 0x30) {
    throw new Error("Invalid DER signature");
  }
  let length = bytes[offset++];
  if (length === 0x81) {
    length = bytes[offset++];
  } else if (length === 0x82) {
    length = (bytes[offset++] << 8) | bytes[offset++];
  }
  if (bytes[offset++] !== 0x02) {
    throw new Error("Invalid DER signature");
  }
  let rLength = bytes[offset++];
  while (bytes[offset] === 0x00 && rLength > 32) {
    offset++;
    rLength--;
  }
  const r = bytes.subarray(offset, offset + rLength);
  offset += rLength;
  if (bytes[offset++] !== 0x02) {
    throw new Error("Invalid DER signature");
  }
  let sLength = bytes[offset++];
  while (bytes[offset] === 0x00 && sLength > 32) {
    offset++;
    sLength--;
  }
  const s = bytes.subarray(offset, offset + sLength);

  const targetLength = 32;
  const rPadded = new Uint8Array(targetLength);
  const sPadded = new Uint8Array(targetLength);
  rPadded.set(r.subarray(Math.max(0, r.length - targetLength)), targetLength - Math.min(r.length, targetLength));
  sPadded.set(s.subarray(Math.max(0, s.length - targetLength)), targetLength - Math.min(s.length, targetLength));

  return base64UrlEncode(concatUint8(rPadded, sPadded));
};

const buildPayload = (request: WebPushRequest): Uint8Array => {
  const json = JSON.stringify({
    url: request.item.url,
    itemId: request.item.itemId,
    sentAt: request.item.sentAt
  });
  return textEncoder.encode(json);
};

export const sendWebPush = async (env: Env, request: WebPushRequest): Promise<WebPushResult> => {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error("VAPID keys are required for Web Push");
  }

  const subscription = request.device.subscription;
  if (!subscription || typeof subscription.endpoint !== "string") {
    throw new Error("Subscription is missing endpoint");
  }

  const { p256dh, auth } = subscription.keys || {};
  if (!p256dh || !auth) {
    throw new Error("Subscription keys are incomplete");
  }

  const userPublicKey = base64UrlDecode(p256dh);
  const authSecret = base64UrlDecode(auth);
  const vapidPublicKey = base64UrlDecode(VAPID_PUBLIC_KEY);
  const vapidPrivateKey = VAPID_PRIVATE_KEY;

  const endpoint = subscription.endpoint;
  const audience = new URL(endpoint).origin;

  const serverKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  const userKey = await crypto.subtle.importKey(
    "raw",
    userPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: userKey },
      serverKeys.privateKey,
      256
    )
  );

  const prk = await hkdf(authSecret, sharedSecret, new Uint8Array(0), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const serverPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeys.publicKey));

  const contentEncryptionKey = await hkdf(
    salt,
    prk,
    createInfo("aesgcm", userPublicKey, serverPublicKeyRaw),
    16
  );

  const nonce = await hkdf(
    salt,
    prk,
    createInfo("nonce", userPublicKey, serverPublicKeyRaw),
    12
  );

  const payloadBytes = buildPayload(request);
  const record = new Uint8Array(2 + payloadBytes.length);
  record.set([0, 0], 0);
  record.set(payloadBytes, 2);

  const aesKey = await crypto.subtle.importKey("raw", contentEncryptionKey, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: nonce
      },
      aesKey,
      record
    )
  );

  const body = concatUint8(salt, serverPublicKeyRaw, ciphertext);

  const x = vapidPublicKey.slice(1, 33);
  const y = vapidPublicKey.slice(33, 65);

  const vapidPrivateCryptoKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: vapidPrivateKey,
      x: base64UrlEncode(x),
      y: base64UrlEncode(y),
      ext: true
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const tokenHeader = base64UrlEncode(textEncoder.encode(JSON.stringify({ alg: "ES256", typ: "JWT" })));
  const expiration = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const subject = env.VAPID_SUBJECT || "mailto:beam-lite@example.com";
  const tokenPayload = base64UrlEncode(
    textEncoder.encode(
      JSON.stringify({
        aud: audience,
        exp: expiration,
        sub: subject
      })
    )
  );

  const unsignedToken = `${tokenHeader}.${tokenPayload}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    vapidPrivateCryptoKey,
    textEncoder.encode(unsignedToken)
  );

  const jwt = `${unsignedToken}.${derToJose(signature)}`;

  const headers = new Headers({
    Authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
    "Content-Encoding": "aesgcm",
    "Content-Type": "application/octet-stream",
    "Crypto-Key": `dh=${base64UrlEncode(serverPublicKeyRaw)}, p256ecdsa=${VAPID_PUBLIC_KEY}`,
    Encryption: `salt=${base64UrlEncode(salt)}`,
    TTL: "60",
    Urgency: "high"
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body
  });

  return { ok: response.status < 400 };
};
