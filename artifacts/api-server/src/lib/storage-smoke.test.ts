/**
 * Contract smoke test for the private object lifecycle.
 *
 * This deliberately uses a tiny in-memory S3-compatible HTTP server rather
 * than a real bucket. It exercises the AWS SDK client, presigned PUT, object
 * metadata, ACL metadata and private reads without credentials or network
 * access outside the test process.
 */

import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { ObjectPermission, canAccessObject, setObjectAclPolicy } from "./objectAcl.ts";
import { ObjectStorageService } from "./objectStorage.ts";

type StoredEntry = {
  body: Buffer;
  contentType: string;
  metadata: Record<string, string>;
};

const FAKE_STORAGE_ENV = {
  S3_ACCESS_KEY_ID: "smoke-access-key",
  S3_SECRET_ACCESS_KEY: "smoke-secret-key",
  S3_REGION: "smoke-region",
  S3_BUCKET: "smoke-bucket",
  PRIVATE_OBJECT_DIR: "/objects/private",
  PUBLIC_OBJECT_SEARCH_PATHS: "/objects/public",
};

function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function requestPath(req: IncomingMessage): string {
  return new URL(req.url ?? "/", "http://127.0.0.1").pathname;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function startFakeS3() {
  const objects = new Map<string, StoredEntry>();
  const server: Server = createServer(async (req, res) => {
    try {
      const path = requestPath(req);
      const [, bucket, ...keyParts] = path.split("/");
      const key = keyParts.join("/");
      if (bucket !== FAKE_STORAGE_ENV.S3_BUCKET || !key) {
        sendJson(res, 404, { error: "not found" });
        return;
      }

      if (req.method === "PUT" && req.headers["x-amz-copy-source"]) {
        await readRequestBody(req);
        const copySourceHeader = req.headers["x-amz-copy-source"];
        const source = decodeURIComponent(
          Array.isArray(copySourceHeader) ? copySourceHeader[0] ?? "" : copySourceHeader,
        );
        const sourceKey = source.replace(/^\/?[^/]+\//, "");
        const sourceObject = objects.get(sourceKey);
        if (!sourceObject) {
          sendJson(res, 404, { error: "source not found" });
          return;
        }
        const aclHeader = Object.entries(req.headers).find(([name]) =>
          name.toLowerCase() === "x-amz-meta-custom-aclpolicy",
        )?.[1];
        sourceObject.metadata = {
          ...sourceObject.metadata,
          "custom-aclpolicy": Array.isArray(aclHeader) ? aclHeader[0] ?? "" : aclHeader ?? "",
        };
        res.writeHead(200, { "Content-Type": "application/xml" });
        res.end("<CopyObjectResult><ETag>smoke</ETag></CopyObjectResult>");
        return;
      }

      if (req.method === "PUT") {
        const body = await readRequestBody(req);
        objects.set(key, {
          body,
          contentType: req.headers["content-type"] ?? "application/octet-stream",
          metadata: {},
        });
        res.writeHead(200);
        res.end();
        return;
      }

      const object = objects.get(key);
      if (!object) {
        sendJson(res, 404, { error: "not found" });
        return;
      }

      if (req.method === "HEAD") {
        const headers: Record<string, string> = {
          "Content-Length": String(object.body.byteLength),
          "Content-Type": object.contentType,
        };
        for (const [name, value] of Object.entries(object.metadata)) {
          headers[`x-amz-meta-${name.replace(/^x-amz-meta-/i, "")}`] = value;
        }
        res.writeHead(200, headers);
        res.end();
        return;
      }

      if (req.method === "GET") {
        res.writeHead(200, {
          "Content-Length": String(object.body.byteLength),
          "Content-Type": object.contentType,
        });
        res.end(object.body);
        return;
      }

      sendJson(res, 405, { error: "method not allowed" });
    } catch {
      sendJson(res, 500, { error: "fake S3 failure" });
    }
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  return {
    objects,
    server,
    endpoint: `http://127.0.0.1:${address.port}`,
  };
}

function withFakeStorage(endpoint: string) {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries({ ...FAKE_STORAGE_ENV, S3_ENDPOINT: endpoint })) {
    previous.set(name, process.env[name]);
    process.env[name] = value;
  }
  return () => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
}

function assertFinalizeMetadata(
  expected: { size: number; contentType: string },
  actual: { size?: number | string; contentType?: string },
) {
  assert.equal(Number(actual.size), expected.size, "size mismatch must reject finalization");
  assert.equal(
    actual.contentType?.split(";")[0]?.trim().toLowerCase(),
    expected.contentType.split(";")[0]?.trim().toLowerCase(),
    "MIME mismatch must reject finalization",
  );
}

test("private storage smoke lifecycle rejects invalid metadata and access", async (t) => {
  const fakeS3 = await startFakeS3();
  t.after(() => fakeS3.server.close());
  const restoreEnvironment = withFakeStorage(fakeS3.endpoint);
  t.after(restoreEnvironment);

  const storage = new ObjectStorageService();
  const content = Buffer.from("fotosintesi: clorofilla");
  const contentType = "text/plain";
  const ownerId = "smoke-owner";

  // Request the upload URL and PUT through the URL, as the mobile client does.
  const uploadUrl = await storage.getObjectEntityUploadURL(contentType);
  assert.match(uploadUrl, /^http:\/\/127\.0\.0\.1:\d+\//);
  assert.match(uploadUrl, /X-Amz-Signature=/i);
  const putResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: content,
  });
  assert.equal(putResponse.status, 200);

  const objectPath = storage.normalizeObjectEntityPath(uploadUrl);
  // normalizeObjectEntityPath intentionally hides PRIVATE_OBJECT_DIR from
  // the public object-entity path.
  assert.match(objectPath, /^\/objects\/uploads\/[0-9a-f-]+$/);
  const objectFile = await storage.getObjectEntityFile(objectPath);
  const [metadata] = await objectFile.getMetadata();

  // These are the same checks performed before finalization in materials.ts.
  assertFinalizeMetadata({ size: content.byteLength, contentType }, metadata);
  assert.throws(
    () => assertFinalizeMetadata({ size: content.byteLength + 1, contentType }, metadata),
    /size mismatch/,
  );
  assert.throws(
    () => assertFinalizeMetadata({ size: content.byteLength, contentType: "image/png" }, metadata),
    /MIME mismatch/,
  );

  await setObjectAclPolicy(objectFile, { owner: ownerId, visibility: "private" });
  assert.equal(await storage.canAccessObjectEntity({
    userId: ownerId,
    objectFile,
    requestedPermission: ObjectPermission.READ,
  }), true);
  assert.equal(await storage.canAccessObjectEntity({
    userId: "another-user",
    objectFile,
    requestedPermission: ObjectPermission.READ,
  }), false, "a different owner must be rejected");
  assert.equal(await storage.canAccessObjectEntity({
    userId: undefined,
    objectFile,
    requestedPermission: ObjectPermission.READ,
  }), false, "anonymous reads must be rejected");

  const privateResponse = await storage.downloadObject(objectFile);
  assert.equal(privateResponse.headers.get("content-type"), contentType);
  assert.equal(await privateResponse.text(), content.toString());

});