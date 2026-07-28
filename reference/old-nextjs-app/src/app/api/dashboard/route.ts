import { NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentRequests, students, tutoringSessions, users } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const userId = await requireUserId();
    const [[user], studentRows, sessionRows, paymentRows] = await Promise.all([
      db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, userId)),
      db.select().from(students).where(eq(students.userId, userId)).orderBy(asc(students.name)),
      db.select().from(tutoringSessions).where(eq(tutoringSessions.userId, userId)).orderBy(desc(tutoringSessions.startedAt)),
      db.select().from(paymentRequests).where(eq(paymentRequests.userId, userId)).orderBy(desc(paymentRequests.createdAt)),
    ]);
    return NextResponse.json({ user, students: studentRows, sessions: sessionRows, payments: paymentRows });
  } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
}
