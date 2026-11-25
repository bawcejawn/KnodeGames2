// OAuth 1.0a request signing for the X API (HMAC-SHA1). No network, no keys of its own: the four values are passed in.
// For a JSON body the body is NOT part of the signature, only the oauth_* values and any query values are.
import crypto from "node:crypto";

const enc = (s) => encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

export function oauthSignature({ method, url, params = {}, oauth, consumerSecret, tokenSecret }) {
  const all = { ...params, ...oauth };
  const norm = Object.keys(all).map((k) => [enc(k), enc(all[k])]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`).join("&");
  const base = [method.toUpperCase(), enc(url), enc(norm)].join("&");
  const key = `${enc(consumerSecret)}&${enc(tokenSecret)}`;
  return crypto.createHmac("sha1", key).update(base).digest("base64");
}

export function authHeader({ method, url, creds, params = {}, nonce, timestamp }) {
  const oauth = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: nonce ?? crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(timestamp ?? Math.floor(Date.now() / 1000)),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };
  oauth.oauth_signature = oauthSignature({ method, url, params, oauth: { ...oauth }, consumerSecret: creds.apiSecret, tokenSecret: creds.accessTokenSecret });
  return "OAuth " + Object.keys(oauth).sort().map((k) => `${enc(k)}="${enc(oauth[k])}"`).join(", ");
}
