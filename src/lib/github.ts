export type GitHubUser = {
  login: string;
  name: string | null;
  avatar_url: string;
  token: string;
};

export async function loadGitHubUser(token: string): Promise<GitHubUser | null> {
  try {
    const r = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "platter-desktop/1.0",
        Accept: "application/vnd.github+json",
      },
    });
    if (!r.ok) return null;
    const u = await r.json() as { login: string; name: string | null; avatar_url: string };
    return { login: u.login, name: u.name, avatar_url: u.avatar_url, token };
  } catch {
    return null;
  }
}
