/**
 * Cloudflare Pages Function — runs on every request to /
 * Replaces %%VAR%% placeholders in index.html with real env vars.
 * Add your Firebase config in: CF Pages → Settings → Environment Variables
 */
export async function onRequestGet(context) {
  const { env, next } = context;

  // Fetch the original index.html
  const response = await next();
  let html = await response.text();

  // Replace placeholders with actual environment variable values
  const replacements = {
    "%%CHESS_QUEST_API_KEY%%":        env.CHESS_QUEST_API_KEY        || "",
    "%%CHESS_QUEST_AUTH_DOMAIN%%":    env.CHESS_QUEST_AUTH_DOMAIN    || "",
    "%%CHESS_QUEST_PROJECT_ID%%":     env.CHESS_QUEST_PROJECT_ID     || "",
    "%%CHESS_QUEST_STORAGE_BUCKET%%": env.CHESS_QUEST_STORAGE_BUCKET || "",
    "%%CHESS_QUEST_SENDER_ID%%":      env.CHESS_QUEST_SENDER_ID      || "",
    "%%CHESS_QUEST_APP_ID%%":         env.CHESS_QUEST_APP_ID         || "",
  };

  for(const [placeholder, value] of Object.entries(replacements)){
    html = html.replaceAll(placeholder, value);
  }

  return new Response(html, {
    headers: {
      "Content-Type": "text/html;charset=UTF-8",
      "Cache-Control": "no-store",        // never cache — contains injected secrets
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}
