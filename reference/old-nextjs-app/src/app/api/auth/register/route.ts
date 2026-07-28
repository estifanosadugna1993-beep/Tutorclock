import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, setSession } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  if (!body.name || !email.includes("@") || String(body.password || "").length < 6) return NextResponse.json({ error: "Enter a name, valid email, and 6+ character password" }, { status: 400 });
  if ((await db.select().from(users).where(eq(users.email, email)).limit(1)).length) return NextResponse.json({ error: "An account already exists" }, { status: 409 });
  const [user] = await db.insert(users).values({ name: String(body.name), email, passwordHash: hashPassword(String(body.password)) }).returning();
  await setSession(user.id);
  return NextResponse.json({ id: user.id, name: user.name, email: user.email });
}
