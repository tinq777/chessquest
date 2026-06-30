/**
 * Cloudflare Pages Function — serves /config.js dynamically.
 * Filename "config.js.js" maps to the route "/config.js" in Pages Functions.
 * This generates the config file content using environment variables
 * instead of having real keys committed to the repo.
 */
export async function onRequest(context) {
  const { env } = context;

  const body = `window.__ENV = {
  CHESS_QUEST_API_KEY: ${JSON.stringify(env.CHESS_QUEST_API_KEY || "")},
  CHESS_QUEST_AUTH_DOMAIN: ${JSON.stringify(env.CHESS_QUEST_AUTH_DOMAIN || "")},
  CHESS_QUEST_PROJECT_ID: ${JSON.stringify(env.CHESS_QUEST_PROJECT_ID || "")},
  CHESS_QUEST_STORAGE_BUCKET: ${JSON.stringify(env.CHESS_QUEST_STORAGE_BUCKET || "")},
  CHESS_QUEST_SENDER_ID: ${JSON.stringify(env.CHESS_QUEST_SENDER_ID || "")},
  CHESS_QUEST_APP_ID: ${JSON.stringify(env.CHESS_QUEST_APP_ID || "")},
};`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript;charset=UTF-8",
      "Cache-Control": "no-store",
    },
  });
}
