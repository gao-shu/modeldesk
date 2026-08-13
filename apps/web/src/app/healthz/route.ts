import { handleGatewayRequest } from "@/lib/server/gateway/app";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return handleGatewayRequest(req);
}
