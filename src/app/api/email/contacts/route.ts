import { NextResponse } from "next/server";

export async function GET() {
  // Placeholder contacts — wire to Gmail People API / contacts later
  return NextResponse.json({
    contacts: [
      { email: "accounting@example.com", name: "Accounting" },
      { email: "boss@example.com", name: "Manager" },
      { email: "records@example.com", name: "Records Desk" },
    ],
  });
}
