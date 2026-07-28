import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ensureDemo, hashPassword, setSession } from "@/lib/auth";

export async function POST(request: Request) {
  await ensureDemo();
  const { email, password } = await request.json();
  const [user] = await db.select().from(users).where(eq(users.email, String(email).toLowerCase())).limit(1);
  if (!user || user.passwordHash !== hashPassword(String(password))) return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
  await setSession(user.id);
  return NextResponse.json({ id: user.id, name: user.name, email: user.email });
}
