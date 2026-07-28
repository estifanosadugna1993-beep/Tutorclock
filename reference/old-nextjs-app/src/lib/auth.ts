import "server-only";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentRequests, students, tutoringSessions, users } from "@/db/schema";

const COOKIE = "tutorly_session";
const secret = process.env.AUTH_SECRET || "local-development-tutorly-secret";
export const hashPassword = (value: string) => createHash("sha256").update(`${secret}:${value}`).digest("hex");
const sign = (id: number) => `${id}.${createHmac("sha256", secret).update(String(id)).digest("hex")}`;

export async function setSession(userId: number) {
  (await cookies()).set(COOKIE, sign(userId), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
}
export async function clearSession() { (await cookies()).delete(COOKIE); }
export async function getUserId() {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [id, signature] = raw.split(".");
  const expected = createHmac("sha256", secret).update(id).digest("hex");
  if (!signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const parsed = Number(id);
  return Number.isInteger(parsed) ? parsed : null;
}
export async function requireUserId() {
  const id = await getUserId();
  if (!id) throw new Error("UNAUTHORIZED");
  return id;
}

export async function ensureDemo() {
  const email = "demo@tutorly.co";
  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) [user] = await db.insert(users).values({ name: "Maya Chen", email, passwordHash: hashPassword("demo1234") }).returning();
  const existing = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);
  if (existing.length) return user;
  const created = await db.insert(students).values([
    { userId: user.id, name: "Emma Rodriguez", subject: "Algebra II", guardianName: "Sofia Rodriguez", guardianEmail: "sofia@example.com", hourlyRate: "45.00", color: "#6d5dfc" },
    { userId: user.id, name: "Liam Parker", subject: "Physics", guardianName: "Daniel Parker", guardianEmail: "daniel@example.com", hourlyRate: "55.00", color: "#ee7c55" },
    { userId: user.id, name: "Noah Williams", subject: "SAT Math", guardianName: "Ava Williams", guardianEmail: "ava@example.com", hourlyRate: "50.00", color: "#20a884" },
  ]).returning();
  const now = new Date();
  const at = (days: number, hour: number) => { const d = new Date(now); d.setDate(d.getDate() - days); d.setHours(hour, 0, 0, 0); return d; };
  await db.insert(tutoringSessions).values([
    { userId: user.id, studentId: created[0].id, startedAt: at(1, 16), endedAt: at(1, 17), durationMinutes: 60, hourlyRate: "45.00", notes: "Quadratic equations and graphing review" },
    { userId: user.id, studentId: created[1].id, startedAt: at(2, 15), endedAt: new Date(at(2, 15).getTime() + 90 * 60000), durationMinutes: 90, hourlyRate: "55.00", notes: "Newton’s laws and practice problems" },
    { userId: user.id, studentId: created[2].id, startedAt: at(4, 17), endedAt: new Date(at(4, 17).getTime() + 75 * 60000), durationMinutes: 75, hourlyRate: "50.00", notes: "Timed SAT problem set" },
    { userId: user.id, studentId: created[0].id, startedAt: at(7, 16), endedAt: new Date(at(7, 16).getTime() + 60 * 60000), durationMinutes: 60, hourlyRate: "45.00", notes: "Functions and domain exercises" },
    { userId: user.id, studentId: created[1].id, startedAt: at(9, 15), endedAt: new Date(at(9, 15).getTime() + 90 * 60000), durationMinutes: 90, hourlyRate: "55.00", notes: "Momentum and energy" },
  ]);
  await db.insert(paymentRequests).values([
    { userId: user.id, studentId: created[0].id, amount: "90.00", periodStart: at(14, 0), periodEnd: now, status: "pending", note: "Two Algebra II sessions" },
    { userId: user.id, studentId: created[1].id, amount: "165.00", periodStart: at(30, 0), periodEnd: at(10, 0), status: "paid", note: "March physics tutoring" },
  ]);
  return user;
}

export async function ownsStudent(userId: number, studentId: number) {
  const [item] = await db.select({ id: students.id }).from(students).where(and(eq(students.id, studentId), eq(students.userId, userId))).limit(1);
  return Boolean(item);
}
