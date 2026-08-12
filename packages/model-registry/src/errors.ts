export type RegistryErrorCode =
  | "not_found"
  | "invalid_key"
  | "timeout"
  | "upstream_error"
  | "invalid_input"
  | "cancelled";

export class RegistryError extends Error {
  readonly code: RegistryErrorCode;
  readonly detail?: unknown;

  constructor(code: RegistryErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = "RegistryError";
    this.code = code;
    this.detail = detail;
  }
}
