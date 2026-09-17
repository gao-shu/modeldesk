import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./resolve-ts.mjs", import.meta.url);
