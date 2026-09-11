import { createAdminCookie, credentialsAreValid } from "../../../../lib/admin-session";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { username?: string; password?: string };
    const username = payload.username?.trim() ?? "";
    const password = payload.password ?? "";
    if (!username || !password || !(await credentialsAreValid(username, password))) {
      return Response.json({ error: "Incorrect admin username or password." }, { status: 401 });
    }
    return Response.json(
      { authenticated: true },
      { headers: { "set-cookie": await createAdminCookie(username) } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin login is unavailable.";
    return Response.json({ error: message }, { status: 500 });
  }
}
