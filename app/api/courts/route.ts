import { getAdminUsername } from "../../../lib/admin-session";
import { getDatabase } from "../../../db/store";

type Role = "admin" | "player";
type ActionPayload = { action?: string; courtId?: number; membershipId?: number; name?: string };
type RequestUser = { id: string; email: string; displayName: string; role: Role };

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) return "The court database has not been prepared yet.";
  if (message.includes("UNIQUE constraint failed")) return "That name is already in use.";
  return message;
}

async function upsertUser(db: D1Database, user: RequestUser) {
  const current = await db
    .prepare("SELECT id, email, display_name AS displayName, role FROM users WHERE id = ?")
    .bind(user.id)
    .first<RequestUser>();
  if (current) {
    if (
      current.email !== user.email ||
      current.displayName !== user.displayName ||
      current.role !== user.role
    ) {
      await db
        .prepare("UPDATE users SET email = ?, display_name = ?, role = ? WHERE id = ?")
        .bind(user.email, user.displayName, user.role, user.id)
        .run();
    }
    return user;
  }
  await db
    .prepare("INSERT INTO users (id, email, display_name, role, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(user.id, user.email, user.displayName, user.role, Date.now())
    .run();
  return user;
}

async function requestUser(db: D1Database, request: Request): Promise<RequestUser | null> {
  const adminUsername = await getAdminUsername(request);
  const deviceId = request.headers.get("x-queueup-player-id")?.trim() ?? "";
  const displayName = request.headers.get("x-queueup-player-name")?.trim() ?? "";
  if (adminUsername) {
    if (/^[a-zA-Z0-9_-]{8,80}$/.test(deviceId) && displayName && displayName.length <= 40) {
      await upsertUser(db, {
        id: `player:${deviceId}`,
        email: "",
        displayName,
        role: "player",
      });
    }
    return upsertUser(db, {
      id: `admin:${adminUsername.toLowerCase()}`,
      email: "",
      displayName: adminUsername,
      role: "admin",
    });
  }

  if (!deviceId && !displayName) return null;
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(deviceId) || !displayName || displayName.length > 40) {
    throw new Error("PLAYER_PROFILE_REQUIRED");
  }
  return upsertUser(db, {
    id: `player:${deviceId}`,
    email: "",
    displayName,
    role: "player",
  });
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

async function snapshot(db: D1Database, me: RequestUser | null) {
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
    id: number; courtId: number; userId: string; displayName: string;
    status: "queued" | "playing"; joinedAt: number; hoppedOnAt: number | null;
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

function requireUser(me: RequestUser | null): asserts me is RequestUser {
  if (!me) throw new Error("PLAYER_PROFILE_REQUIRED");
}

function requireAdmin(me: RequestUser | null): asserts me is RequestUser {
  if (me?.role !== "admin") throw new Error("ADMIN_REQUIRED");
}

function requiredCourtId(value: unknown) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Choose a valid court.");
  return id;
}

export async function GET(request: Request) {
  try {
    const db = getDatabase();
    const me = await requestUser(db, request);
    await ensureDefaultCourts(db);
    return Response.json(await snapshot(db, me));
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = getDatabase();
    const me = await requestUser(db, request);
    const payload = (await request.json()) as ActionPayload;
    const now = Date.now();
    switch (payload.action) {
      case "join": {
        requireUser(me);
        const courtId = requiredCourtId(payload.courtId);
        await db
          .prepare("INSERT INTO memberships (court_id, user_id, status, joined_at) VALUES (?, ?, 'queued', ?)")
          .bind(courtId, me.id, now)
          .run();
        break;
      }
      case "leave": {
        requireUser(me);
        const courtId = requiredCourtId(payload.courtId);
        await db.prepare("DELETE FROM memberships WHERE court_id = ? AND user_id = ?").bind(courtId, me.id).run();
        break;
      }
      case "hopOn": {
        requireUser(me);
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
        requireUser(me);
        const courtId = requiredCourtId(payload.courtId);
        await db
          .prepare("UPDATE memberships SET status = 'queued', joined_at = ?, hopped_on_at = NULL WHERE court_id = ? AND user_id = ? AND status = 'playing'")
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
          db.prepare("INSERT INTO users (id, email, display_name, role, created_at) VALUES (?, '', ?, 'player', ?)").bind(guestId, name, now),
          db.prepare("INSERT INTO memberships (court_id, user_id, status, joined_at) VALUES (?, ?, 'queued', ?)").bind(courtId, guestId, now),
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
    const status = message === "PLAYER_PROFILE_REQUIRED" ? 401 : message === "ADMIN_REQUIRED" ? 403 : 400;
    return Response.json(
      {
        error:
          message === "PLAYER_PROFILE_REQUIRED"
            ? "Choose a player name first."
            : message === "ADMIN_REQUIRED"
              ? "Admin login required."
              : message,
      },
      { status },
    );
  }
}
