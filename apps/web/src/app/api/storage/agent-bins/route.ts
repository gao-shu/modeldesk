import { NextResponse } from "next/server";
import {
  getAgentBinsStatus,
  installAgentBins,
} from "@/lib/server/agent-bins";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, agentBins: getAgentBinsStatus() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** POST { addPath?: boolean } — repair/install Desktop agent command shims. */
export async function POST(req: Request) {
  try {
    let addPath = true;
    try {
      const body = (await req.json()) as { addPath?: boolean };
      if (typeof body?.addPath === "boolean") addPath = body.addPath;
    } catch {
      /* empty body */
    }
    const agentBins = await installAgentBins({ addPath });
    return NextResponse.json({ ok: true, agentBins });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
