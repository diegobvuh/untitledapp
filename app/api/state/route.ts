import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { userSettings } from "../../../db/schema";

function identity(request: Request) {
  const userId = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email");
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  let fullName: string | null = null;
  if (encodedName) {
    try { fullName = decodeURIComponent(encodedName); } catch { fullName = null; }
  }
  return userId && email ? { userId, email, displayName: fullName ?? email } : null;
}

export async function GET(request: Request) {
  const user = identity(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const [row] = await getDb().select().from(userSettings).where(eq(userSettings.userId, user.userId)).limit(1);
  return Response.json({ user: { email: user.email, displayName: user.displayName }, state: row ? JSON.parse(row.state) : null });
}

export async function POST(request: Request) {
  const user = identity(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const state = JSON.stringify(await request.json());
  await getDb().insert(userSettings).values({ userId: user.userId, state, updatedAt: new Date() }).onConflictDoUpdate({ target: userSettings.userId, set: { state, updatedAt: new Date() } });
  return Response.json({ saved: true });
}
