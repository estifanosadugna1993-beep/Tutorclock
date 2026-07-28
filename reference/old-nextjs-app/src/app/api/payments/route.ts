import { NextResponse } from "next/server";
import { db } from "@/db";
import { paymentRequests } from "@/db/schema";
import { ownsStudent, requireUserId } from "@/lib/auth";
export async function POST(request: Request) { try { const userId = await requireUserId(); const b = await request.json(); const studentId = Number(b.studentId); if (!await ownsStudent(userId, studentId) || Number(b.amount) <= 0) return NextResponse.json({ error: "Check student and amount" }, { status: 400 }); const [item] = await db.insert(paymentRequests).values({ userId, studentId, amount: Number(b.amount).toFixed(2), periodStart: new Date(b.periodStart), periodEnd: new Date(b.periodEnd), status: "pending", note: b.note || "" }).returning(); return NextResponse.json(item); } catch { return NextResponse.json({ error: "Unable to create request" }, { status: 400 }); } }
