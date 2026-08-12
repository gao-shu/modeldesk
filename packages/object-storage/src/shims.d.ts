declare module "ali-oss" {
  interface OSSOptions {
    region?: string;
    accessKeyId: string;
    accessKeySecret: string;
    bucket?: string;
    endpoint?: string;
    secure?: boolean;
    authorizationV4?: boolean;
  }

  interface PutOptions {
    headers?: Record<string, string>;
    mime?: string;
  }

  export default class OSS {
    constructor(options: OSSOptions);
    put(
      name: string,
      file: Buffer | string,
      options?: PutOptions,
    ): Promise<{ name: string; url: string }>;
  }
}

declare module "cos-nodejs-sdk-v5" {
  interface COSOptions {
    SecretId: string;
    SecretKey: string;
  }

  export default class COS {
    constructor(options: COSOptions);
    putObject(
      params: Record<string, unknown>,
      callback: (err: Error | null, data: unknown) => void,
    ): void;
  }
}

declare module "bce-sdk-js" {
  export class BosClient {
    constructor(options: {
      endpoint: string;
      credentials: { ak: string; sk: string };
    });
    putObjectFromBlob(
      bucket: string,
      key: string,
      data: Buffer,
      options?: Record<string, string>,
    ): Promise<unknown>;
  }
}
