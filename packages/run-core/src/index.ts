/** Public run-core APIs for MCP / CLI / Gateway shells. */

export {
  listRunModelsForAgent,
  runAudio,
  runCoreResultToPublic,
  runImage,
  runText,
  runVideo,
  type RunCoreAgentModality,
  type RunCoreOutcome,
  type RunPreparedInfo,
  type RunSingleModelInput,
} from "./run-core";

export {
  ensureDataDirs,
  getDataDir,
  refreshAgentDataDir,
  resolveAgentDataDir,
  type AgentDataDirSource,
} from "./paths";

export {
  abortRun,
  clearRunAbort,
  hasRunAbort,
  registerRunAbort,
} from "./run-abort";

export { getEncryptionSecretStatus } from "./encryption-secret";

export { closeDb } from "./db";
