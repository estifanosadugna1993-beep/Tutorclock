import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentRequests } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { try { const userId = await requireUserId(); const b = await request.json(); const values: Record<string, unknown> = {}; if (["pending", "paid", "overdue"].includes(b.status)) values.status = b.status; if (b.note !== undefined) values.note = b.note; if (b.amount !== undefined) values.amount = Number(b.amount).toFixed(2); const [item] = await db.update(paymentRequests).set(values).where(and(eq(paymentRequests.id, Number((await params).id)), eq(paymentRequests.userId, userId))).returning(); return NextResponse.json(item); } catch { return NextResponse.json({ error: "Unable to update" }, { status: 400 }); } }
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) { try { const userId = await requireUserId(); await db.delete(paymentRequests).where(and(eq(paymentRequests.id, Number((await params).id)), eq(paymentRequests.userId, userId))); return NextResponse.json({ ok: true }); } catch { return NextResponse.json({ error: "Unable to delete" }, { status: 400 }); } }
