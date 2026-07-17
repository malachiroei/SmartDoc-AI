import { NextResponse } from "next/server";

/**
 * GET /api/email/contacts
 * Server no longer returns fake example.com contacts — clients use localStorage saved emails.
 */
export async function GET() {
  return NextResponse.json({ contacts: [] });
}
