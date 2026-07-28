import { NextResponse } from "next/server";
import { db } from "@/db";
import { students } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
export async function POST(request: Request) { try { const userId = await requireUserId(); const b = await request.json(); if (!b.name || !b.subject || !b.guardianEmail || Number(b.hourlyRate) <= 0) return NextResponse.json({ error: "Complete all required fields" }, { status: 400 }); const [item] = await db.insert(students).values({ userId, name: b.name, subject: b.subject, guardianName: b.guardianName || "Family", guardianEmail: b.guardianEmail, hourlyRate: Number(b.hourlyRate).toFixed(2), color: b.color || "#6d5dfc" }).returning(); return NextResponse.json(item); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); } }
