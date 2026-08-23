import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  canAccessObject,
  getObjectAclPolicy,
  ObjectAclPolicy,
  ObjectPermission,
  setObjectAclPolicy,
} from "./objectAcl";

export type ObjectMetadata = {
  size?: number | string;
  contentType?: string;
  metadata?: Record<string, string>;
};

export interface StoredObject {
  readonly name: string;
  exists(): Promise<[boolean]>;
  getMetadata(): Promise<[ObjectMetadata]>;
  createReadStream(): Readable;
  setMetadata(options: { metadata?: Record<string, string> }): Promise<void>;
  delete(): Promise<void>;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variabile storage mancante: ${name}`);
  return value;
}

function storageConfig() {
  return {
    endpoint: required("S3_ENDPOINT"),
    region: process.env.S3_REGION?.trim() || "auto",
    bucket: required("S3_BUCKET"),
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
  };
}

function createClient(config: ReturnType<typeof storageConfig>) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function objectKeyFromPath(path: string): string {
  const config = storageConfig();
  const normalized = path.replace(/^\/+/, "");
  const bucketPrefix = `${config.bucket}/`;
  return normalized.startsWith(bucketPrefix)
    ? normalized.slice(bucketPrefix.length)
    : normalized;
}

function objectPathForKey(key: string): string {
  return `/objects/${key}`;
}

class S3StoredObject implements StoredObject {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly key: string,
  ) {}

  get name() {
    return `${this.bucket}/${this.key}`;
  }

  async exists(): Promise<[boolean]> {
    try {
      await this.getMetadata();
      return [true];
    } catch (error) {
      if (isNotFound(error)) return [false];
      throw error;
    }
  }

  async getMetadata(): Promise<[ObjectMetadata]> {
    const response = await this.client.send(new HeadObjectCommand({
      Bucket: this.bucket,
      Key: this.key,
    }));
    return [{
      size: response.ContentLength,
      contentType: response.ContentType,
      metadata: response.Metadata ?? {},
    }];
  }

  createReadStream(): Readable {
    const client = this.client;
    const bucket = this.bucket;
    const key = this.key;
    return Readable.from((async function* () {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!response.Body) throw new Error("Storage object has no body");
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        yield chunk;
      }
    })());
  }

  async setMetadata(options: { metadata?: Record<string, string> }): Promise<void> {
    const [current] = await this.getMetadata();
    await this.client.send(new CopyObjectCommand({
      Bucket: this.bucket,
      Key: this.key,
      CopySource: `${this.bucket}/${this.key}`,
      MetadataDirective: "REPLACE",
      ContentType: current.contentType,
      Metadata: { ...(current.metadata ?? {}), ...(options.metadata ?? {}) },
    }));
  }

  async delete(): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: this.key,
    }));
  }
}

function isNotFound(error: unknown): boolean {
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
  const name = (error as { name?: string })?.name;
  return status === 404 || name === "NotFound" || name === "NoSuchKey";
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  private config() {
    return storageConfig();
  }

  private client() {
    const config = this.config();
    return { config, client: createClient(config) };
  }

  getPublicObjectSearchPaths(): string[] {
    const paths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "")
      .split(",").map((path) => path.trim()).filter(Boolean);
    if (!paths.length) throw new Error("PUBLIC_OBJECT_SEARCH_PATHS non configurata");
    return [...new Set(paths)];
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR?.trim();
    if (!dir) throw new Error("PRIVATE_OBJECT_DIR non configurata");
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<StoredObject | null> {
    const { config, client } = this.client();
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const key = objectKeyFromPath(`${searchPath}/${filePath}`);
      const file = new S3StoredObject(client, config.bucket, key);
      if ((await file.exists())[0]) return file;
    }
    return null;
  }

  async downloadObject(file: StoredObject, cacheTtlSec = 3600): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;
    const headers: Record<string, string> = {
      "Content-Type": metadata.contentType || "application/octet-stream",
      "Cache-Control": `${aclPolicy?.visibility === "public" ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size !== undefined) headers["Content-Length"] = String(metadata.size);
    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(contentType: string): Promise<string> {
    const { config, client } = this.client();
    const privateDir = this.getPrivateObjectDir();
    const prefix = objectKeyFromPath(privateDir).replace(/\/+$/, "");
    const key = `${prefix}/uploads/${randomUUID()}`;
    return getSignedUrl(client, new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: contentType,
    }), { expiresIn: 900 });
  }

  async getObjectEntityFile(objectPath: string): Promise<StoredObject> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    const { config, client } = this.client();
    const key = `${objectKeyFromPath(this.getPrivateObjectDir()).replace(/\/+$/, "")}/${objectPath.slice("/objects/".length)}`;
    const file = new S3StoredObject(client, config.bucket, key);
    if (!(await file.exists())[0]) throw new ObjectNotFoundError();
    return file;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (rawPath.startsWith("/objects/")) return rawPath;
    try {
      const url = new URL(rawPath);
      const config = this.config();
      const key = objectKeyFromPath(url.pathname);
      const prefix = objectKeyFromPath(this.getPrivateObjectDir()).replace(/\/+$/, "");
      if (key.startsWith(`${prefix}/`)) return objectPathForKey(key.slice(prefix.length + 1));
    } catch {
      // The caller will receive a validation error when the path is not usable.
    }
    return rawPath;
  }

  async trySetObjectEntityAclPolicy(rawPath: string, aclPolicy: ObjectAclPolicy): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) return normalizedPath;
    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: { userId?: string; objectFile: StoredObject; requestedPermission?: ObjectPermission }): Promise<boolean> {
    return canAccessObject({ userId, objectFile, requestedPermission: requestedPermission ?? ObjectPermission.READ });
  }
}
