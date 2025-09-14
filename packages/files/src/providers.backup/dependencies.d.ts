/**
 * Type declarations for optional dependencies
 */

declare module '@aws-sdk/client-s3' {
  export class S3Client {
    constructor(config: any);
    send(command: any): Promise<any>;
  }
  
  export class HeadObjectCommand {
    constructor(params: any);
  }
  
  export class GetObjectCommand {
    constructor(params: any);
  }
  
  export class PutObjectCommand {
    constructor(params: any);
  }
  
  export class DeleteObjectCommand {
    constructor(params: any);
  }
  
  export class CopyObjectCommand {
    constructor(params: any);
  }
  
  export class ListObjectsV2Command {
    constructor(params: any);
  }
}

declare module 'googleapis' {
  export const google: {
    auth: {
      OAuth2: new (clientId: string, clientSecret: string) => any;
    };
    drive: (config: any) => any;
  };
}

declare module 'webdav' {
  export function createClient(url: string, config: any): any;
}