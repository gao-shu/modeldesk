import type {
  ApiConfig,
  ApiConfigInput,
  ApiConfigUpdate,
} from "./types";

/**
 * Persistence port. Host apps (e.g. ModelDesk SQLite) implement this.
 * Secrets stay behind getSecret — never returned on list/get.
 */
export type ModelRegistryStore = {
  list(modality?: string): ApiConfig[] | Promise<ApiConfig[]>;
  get(id: string): ApiConfig | null | Promise<ApiConfig | null>;
  create(input: ApiConfigInput): ApiConfig | Promise<ApiConfig>;
  update(
    id: string,
    input: ApiConfigUpdate,
  ): ApiConfig | null | Promise<ApiConfig | null>;
  delete(id: string): boolean | Promise<boolean>;
  /** Decrypt plaintext API key for server-side resolve / runtime. */
  getSecret(id: string): string | null | Promise<string | null>;
};
