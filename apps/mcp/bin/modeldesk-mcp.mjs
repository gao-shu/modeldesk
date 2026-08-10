#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAgentEntry } from "../../../scripts/run-agent-entry.mjs";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
runAgentEntry({ packageRoot });
