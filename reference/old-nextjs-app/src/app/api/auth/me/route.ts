import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getUserId } from "@/lib/auth";
export async function GET() { const id = await getUserId(); if (!id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const [user] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, id)); return NextResponse.json(user); }
