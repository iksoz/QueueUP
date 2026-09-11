import { clearAdminCookie } from "../../../../lib/admin-session";

export async function POST(request: Request) {
  return Response.json(
    { authenticated: false },
    { headers: { "set-cookie": clearAdminCookie(request) } },
  );
}
