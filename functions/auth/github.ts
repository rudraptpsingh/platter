// GET /auth/github
// Initiates GitHub OAuth — redirects the browser to GitHub's authorize page.
// Query params from the Tauri desktop app:
//   redirect_uri — the local callback server (http://127.0.0.1:<port>/callback)
// The desktop's redirect_uri is encoded in `state` so the callback can retrieve it
// without GitHub needing to know about it.

interface Env {
  GITHUB_CLIENT_ID: string;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const redirectUri = url.searchParams.get("redirect_uri");

  if (!redirectUri) {
    return new Response("missing redirect_uri", { status: 400 });
  }
  // Only allow local Tauri callback servers
  if (!redirectUri.startsWith("http://127.0.0.1:") && !redirectUri.startsWith("http://localhost:")) {
    return new Response("redirect_uri must be a localhost address", { status: 400 });
  }

  // Encode the desktop redirect_uri in the state param so the callback can forward it
  const state = btoa(JSON.stringify({ redirect_uri: redirectUri }));

  const githubUrl = new URL("https://github.com/login/oauth/authorize");
  githubUrl.searchParams.set("client_id", ctx.env.GITHUB_CLIENT_ID);
  githubUrl.searchParams.set("redirect_uri", `${new URL(ctx.request.url).origin}/auth/github/callback`);
  githubUrl.searchParams.set("scope", "read:user");
  githubUrl.searchParams.set("state", state);

  return Response.redirect(githubUrl.toString(), 302);
};
