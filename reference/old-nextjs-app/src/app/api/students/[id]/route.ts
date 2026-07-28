import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { students } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { try { const userId = await requireUserId(); const id = Number((await params).id); const b = await request.json(); const values: Record<string, unknown> = {}; for (const key of ["name", "subject", "guardianName", "guardianEmail", "color", "active"]) if (b[key] !== undefined) values[key] = b[key]; if (b.hourlyRate !== undefined) values.hourlyRate = Number(b.hourlyRate).toFixed(2); const [item] = await db.update(students).set(values).where(and(eq(students.id, id), eq(students.userId, userId))).returning(); return item ? NextResponse.json(item) : NextResponse.json({ error: "Not found" }, { status: 404 }); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); } }
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) { try { const userId = await requireUserId(); const id = Number((await params).id); await db.delete(students).where(and(eq(students.id, id), eq(students.userId, userId))); return NextResponse.json({ ok: true }); } catch { return NextResponse.json({ error: "Unable to delete" }, { status: 400 }); } }
