import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "turas-anonymous-survey",
    time: new Date().toISOString()
  });
}
