/**
 * Same-origin Cloudflare Pages Function for Chess Quest cloud sync.
 * The browser sends the user's Firebase ID token; Firestore rules still apply.
 * This avoids iPhone/Safari direct Firestore connection timeouts.
 */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      "Cache-Control": "no-store",
    },
  });
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === "object") {
    const fields = {};
    for (const key of Object.keys(value)) fields[key] = toFirestoreValue(value[key]);
    return { mapValue: { fields } };
  }
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return { stringValue: String(value) };
}

function fromFirestoreValue(v) {
  if (!v || typeof v !== "object") return undefined;
  if ("nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return !!v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ("mapValue" in v) {
    const out = {};
    const fields = v.mapValue.fields || {};
    for (const key of Object.keys(fields)) out[key] = fromFirestoreValue(fields[key]);
    return out;
  }
  return undefined;
}

function fromFields(fields) {
  const out = {};
  for (const key of Object.keys(fields || {})) out[key] = fromFirestoreValue(fields[key]);
  return out;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });

  const projectId = env.CHESS_QUEST_PROJECT_ID || "";
  if (!projectId) return json({ error: "Missing CHESS_QUEST_PROJECT_ID on Cloudflare" }, 500);

  const url = new URL(request.url);
  const uid = url.searchParams.get("uid") || "";
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(uid)) return json({ error: "Invalid or missing uid" }, 400);

  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Missing Firebase ID token" }, 401);

  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/users/${encodeURIComponent(uid)}`;

  try {
    if (request.method === "GET") {
      const res = await fetch(firestoreUrl, { headers: { Authorization: auth } });
      const text = await res.text();
      const body = text ? JSON.parse(text) : {};
      if (res.status === 404) return json({ notFound: true, data: null });
      if (!res.ok) return json({ error: body?.error?.message || res.statusText, status: res.status, details: body }, res.status);
      return json({ ok: true, data: fromFields(body.fields || {}) });
    }

    if (request.method === "PATCH" || request.method === "POST") {
      const incoming = await request.json().catch(() => ({}));
      const data = incoming.fields || {};
      const fields = {};
      for (const key of Object.keys(data)) fields[key] = toFirestoreValue(data[key]);
      const res = await fetch(firestoreUrl, {
        method: "PATCH",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      const text = await res.text();
      const body = text ? JSON.parse(text) : {};
      if (!res.ok) return json({ error: body?.error?.message || res.statusText, status: res.status, details: body }, res.status);
      return json({ ok: true, data: fromFields(body.fields || {}) });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return json({ error: e?.message || String(e) }, 500);
  }
}
