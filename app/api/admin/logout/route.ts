import { clearAdminCookie } from "../../../../lib/admin-session";

export async function POST() {
  return Response.json(
    { authenticated: false },
    { headers: { "set-cookie": clearAdminCookie() } },
  );
}
