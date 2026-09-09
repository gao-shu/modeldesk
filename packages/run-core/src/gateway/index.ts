/** Gateway HTTP surface + helpers for MCP / headless shells. */

export { handleGatewayRequest } from "./app";
export {
  checkAuthHeader,
  checkGatewayAuth,
  hostnameFromHostHeader,
  isLoopbackHostname,
  loadGatewayTokens,
  tokenMatches,
} from "./auth";
export {
  acquireGatewaySlot,
  resetGatewayRateLimitState,
} from "./rate-limit";
export {
  aliasesFilePath,
  isStableAlias,
  loadAliases,
  loadStoredAliases,
  modalityForAlias,
  saveAliases,
  STABLE_ALIASES,
  type AliasMap,
  type StableAlias,
} from "./aliases";
export { resolveModelRef } from "./resolve-model";
