import { handleGatewayRequest } from "@/lib/server/gateway/app";

export const runtime = "nodejs";
/** Long image/video generations via Gateway. */
export const maxDuration = 300;

type Ctx = { params: Promise<{ path: string[] }> };

async function dispatch(req: Request, _ctx: Ctx): Promise<Response> {
  try {
    return await handleGatewayRequest(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[modeldesk-gateway]", message);
    return Response.json(
      {
        error: {
          message,
          type: "server_error",
          param: null,
          code: null,
        },
      },
      { status: 500 },
    );
  }
}

export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const DELETE = dispatch;
