// GET /auth/github/callback
// Receives GitHub's redirect after user authorizes.
// Exchanges the code for an access_token (server-side — keeps client_secret safe).
// Then redirects to the Tauri app's local server with ?token=<access_token>.

interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const code = url.searchParams.get("code");
  const rawState = url.searchParams.get("state");

  if (!code || !rawState) {
    return errorPage("Authorization failed — missing code or state from GitHub.");
  }

  let stateObj: { redirect_uri: string };
  try {
    stateObj = JSON.parse(atob(rawState));
  } catch {
    return errorPage("Invalid state parameter.");
  }

  const { redirect_uri } = stateObj;
  if (!redirect_uri || (!redirect_uri.startsWith("http://127.0.0.1:") && !redirect_uri.startsWith("http://localhost:"))) {
    return errorPage("Invalid redirect target.");
  }

  // Exchange code for access_token — done server-side so client_secret never leaves Cloudflare
  let tokenData: { access_token?: string; error?: string; error_description?: string };
  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        client_id: ctx.env.GITHUB_CLIENT_ID,
        client_secret: ctx.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${new URL(ctx.request.url).origin}/auth/github/callback`,
      }),
    });
    tokenData = await tokenRes.json() as typeof tokenData;
  } catch (e) {
    return errorPage("Token exchange request failed.");
  }

  if (!tokenData.access_token) {
    return errorPage(`GitHub error: ${tokenData.error_description ?? tokenData.error ?? "no access token returned"}`);
  }

  // Redirect back to the Tauri local server
  const callbackUrl = new URL(redirect_uri);
  callbackUrl.searchParams.set("token", tokenData.access_token);

  return Response.redirect(callbackUrl.toString(), 302);
};

function errorPage(message: string): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>platter auth error</title>
    <style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;
    height:100vh;margin:0;background:#14110D;color:#E8DFCD}p{font-size:16px;max-width:400px;text-align:center}</style>
    </head><body><p>${message}</p></body></html>`,
    { status: 400, headers: { "Content-Type": "text/html" } }
  );
}
