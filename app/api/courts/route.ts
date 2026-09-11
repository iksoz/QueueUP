import { getDatabase } from "../../../db/store";

type Role = "admin" | "player";
type ActionPayload = {
  action?: string;
  courtId?: number;
  membershipId?: number;
  name?: string;
};
type RequestUser = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
};

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) return "The court database has not been prepared yet.";
  if (message.includes("UNIQUE constraint failed")) return "That name is already in use.";
  return message;
}

function decodeFullName(request: Request) {
  const encoded = request.headers.get("oai-authenticated-user-full-name");
  if (
    !encoded ||
    request.headers.get("oai-authenticated-user-full-name-encoding") !==
      "percent-encoded-utf-8"
  ) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

async function ensureUser(db: D1Database, request: Request): Promise<RequestUser> {
  const id = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email");
  if (!id || !email) throw new Error("SIGN_IN_REQUIRED");
  const displayName = decodeFullName(request) ?? email.split("@")[0];
  const current = await db
    .prepare("SELECT id, email, display_name AS displayName, role FROM users WHERE id = ?")
    .bind(id)
    .first<RequestUser>();
  if (current) {
    if (current.email !== email || current.displayName !== displayName) {
      await db
        .prepare("UPDATE users SET email = ?, display_name = ? WHERE id = ?")
        .bind(email, displayName, id)
        .run();
      return { ...current, email, displayName };
    }
    return current;
  }
  const adminCount = await db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'")
    .first<{ count: number }>();
  const role: Role = Number(adminCount?.count ?? 0) === 0 ? "admin" : "player";
  await db
    .prepare("INSERT INTO users (id, email, display_name, role, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, email, displayName, role, Date.now())
    .run();
  return { id, email, displayName, role };
}

async function ensureDefaultCourts(db: D1Database) {
  const current = await db.prepare("SELECT COUNT(*) AS count FROM courts").first<{ count: number }>();
  if (Number(current?.count ?? 0) > 0) return;
  const now = Date.now();
  await db.batch(
    ["Court 1", "Court 2", "Court 3", "Court 4"].map((name, index) =>
      db.prepare("INSERT OR IGNORE INTO courts (name, created_at) VALUES (?, ?)").bind(name, now + index),
    ),
  );
}

async function snapshot(db: D1Database, me: RequestUser) {
  const [courtResult, memberResult] = await Promise.all([
    db.prepare("SELECT id, name, created_at AS createdAt FROM courts ORDER BY id").all(),
    db
      .prepare(
        `SELECT m.id, m.court_id AS courtId, m.user_id AS userId, u.display_name AS displayName,
                m.status, m.joined_at AS joinedAt, m.hopped_on_at AS hoppedOnAt
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         ORDER BY m.court_id,
                  CASE m.status WHEN 'playing' THEN 0 ELSE 1 END,
                  COALESCE(m.hopped_on_at, m.joined_at), m.id`,
      )
      .all(),
  ]);
  const members = memberResult.results as Array<{
    id: number;
    courtId: number;
    userId: string;
    displayName: string;
    status: "queued" | "playing";
    joinedAt: number;
    hoppedOnAt: number | null;
  }>;
  return {
    me,
    courts: (courtResult.results as Array<{ id: number; name: string; createdAt: number }>).map(
      (court) => ({
        ...court,
        players: members.filter((member) => member.courtId === court.id && member.status === "playing"),
        queue: members
          .filter((member) => member.courtId === court.id && member.status === "queued")
          .map((member, index) => ({ ...member, position: index + 1 })),
      }),
    ),
  };
}

function requireAdmin(me: RequestUser) {
  if (me.role !== "admin") throw new Error("ADMIN_REQUIRED");
}

function requiredCourtId(value: unknown) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Choose a valid court.");
  return id;
}

export async function GET(request: Request) {
  try {
    const db = getDatabase();
    const me = await ensureUser(db, request);
    await ensureDefaultCourts(db);
    return Response.json(await snapshot(db, me));
  } catch (error) {
    const message = errorMessage(error);
    return Response.json(
      { error: message === "SIGN_IN_REQUIRED" ? "Sign in to view live courts." : message },
      { status: message === "SIGN_IN_REQUIRED" ? 401 : 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const db = getDatabase();
    const me = await ensureUser(db, request);
    const payload = (await request.json()) as ActionPayload;
    const now = Date.now();
    switch (payload.action) {
      case "join": {
        const courtId = requiredCourtId(payload.courtId);
        await db
          .prepare("INSERT INTO memberships (court_id, user_id, status, joined_at) VALUES (?, ?, 'queued', ?)")
          .bind(courtId, me.id, now)
          .run();
        break;
      }
      case "leave": {
        const courtId = requiredCourtId(payload.courtId);
        await db.prepare("DELETE FROM memberships WHERE court_id = ? AND user_id = ?").bind(courtId, me.id).run();
        break;
      }
      case "hopOn": {
        const courtId = requiredCourtId(payload.courtId);
        const result = await db
          .prepare(
            `UPDATE memberships
             SET status = 'playing', hopped_on_at = ?
             WHERE court_id = ? AND user_id = ? AND status = 'queued'
               AND id = (SELECT id FROM memberships WHERE court_id = ? AND status = 'queued' ORDER BY joined_at, id LIMIT 1)
               AND (SELECT COUNT(*) FROM memberships WHERE court_id = ? AND status = 'playing') < 4`,
          )
          .bind(now, courtId, me.id, courtId, courtId)
          .run();
        if (!result.meta.changes) throw new Error("Only the next queued player can hop on when a spot is open.");
        break;
      }
      case "hopOff": {
        const courtId = requiredCourtId(payload.courtId);
        await db
          .prepare(
            "UPDATE memberships SET status = 'queued', joined_at = ?, hopped_on_at = NULL WHERE court_id = ? AND user_id = ? AND status = 'playing'",
          )
          .bind(now, courtId, me.id)
          .run();
        break;
      }
      case "createCourt": {
        requireAdmin(me);
        const name = payload.name?.trim();
        if (!name || name.length > 32) throw new Error("Enter a court name up to 32 characters.");
        await db.prepare("INSERT INTO courts (name, created_at) VALUES (?, ?)").bind(name, now).run();
        break;
      }
      case "addPlayer": {
        requireAdmin(me);
        const courtId = requiredCourtId(payload.courtId);
        const name = payload.name?.trim();
        if (!name || name.length > 40) throw new Error("Enter a player name up to 40 characters.");
        const guestId = `guest:${crypto.randomUUID()}`;
        await db.batch([
          db
            .prepare("INSERT INTO users (id, email, display_name, role, created_at) VALUES (?, '', ?, 'player', ?)")
            .bind(guestId, name, now),
          db
            .prepare("INSERT INTO memberships (court_id, user_id, status, joined_at) VALUES (?, ?, 'queued', ?)")
            .bind(courtId, guestId, now),
        ]);
        break;
      }
      case "kickPlayer": {
        requireAdmin(me);
        const membershipId = Number(payload.membershipId);
        if (!Number.isInteger(membershipId) || membershipId <= 0) throw new Error("Choose a valid player.");
        await db.prepare("DELETE FROM memberships WHERE id = ?").bind(membershipId).run();
        break;
      }
      default:
        return Response.json({ error: "Unknown action." }, { status: 400 });
    }
    return Response.json(await snapshot(db, me));
  } catch (error) {
    const message = errorMessage(error);
    const status = message === "SIGN_IN_REQUIRED" ? 401 : message === "ADMIN_REQUIRED" ? 403 : 400;
    return Response.json(
      {
        error:
          message === "SIGN_IN_REQUIRED"
            ? "Sign in to make changes."
            : message === "ADMIN_REQUIRED"
              ? "Only an admin can do that."
              : message,
      },
      { status },
    );
  }
}
