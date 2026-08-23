import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import express from "express";
import { test } from "node:test";

const storageEnv = {
  S3_ACCESS_KEY_ID: "http-flow-access",
  S3_SECRET_ACCESS_KEY: "http-flow-secret",
  S3_REGION: "http-flow-region",
  S3_BUCKET: "http-flow-bucket",
  PRIVATE_OBJECT_DIR: "/objects/private",
  PUBLIC_OBJECT_SEARCH_PATHS: "/objects/public",
};

type StoredObject = {
  body: Buffer;
  contentType: string;
  metadata: Record<string, string>;
};

function json(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function body(req: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function startS3() {
  const objects = new Map<string, StoredObject>();
  let failDeletes = false;
  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    const [, bucket, ...parts] = path.split("/");
    const key = parts.join("/");
    if (bucket !== storageEnv.S3_BUCKET || !key) {
      json(res, 404, { error: "not found" });
      return;
    }

    if (req.method === "PUT" && req.headers["x-amz-copy-source"]) {
      await body(req);
      const source = decodeURIComponent(String(req.headers["x-amz-copy-source"]));
      const sourceKey = source.replace(/^\/?[^/]+\//, "");
      const object = objects.get(sourceKey);
      if (!object) {
        json(res, 404, { error: "not found" });
        return;
      }
      const acl = Object.entries(req.headers).find(([name]) =>
        name.toLowerCase() === "x-amz-meta-custom-aclpolicy",
      )?.[1];
      object.metadata["custom-aclpolicy"] = Array.isArray(acl) ? acl[0] ?? "" : acl ?? "";
      res.writeHead(200);
      res.end("<CopyObjectResult/>");
      return;
    }

    if (req.method === "PUT") {
      objects.set(key, {
        body: await body(req),
        contentType: String(req.headers["content-type"] ?? "application/octet-stream"),
        metadata: {},
      });
      res.writeHead(200);
      res.end();
      return;
    }
    if (req.method === "DELETE") {
      if (failDeletes) {
        json(res, 503, { error: "storage unavailable" });
        return;
      }
      objects.delete(key);
      res.writeHead(204);
      res.end();
      return;
    }

    const object = objects.get(key);
    if (!object) {
      json(res, 404, { error: "not found" });
      return;
    }
    if (req.method === "HEAD") {
      res.writeHead(200, {
        "content-length": String(object.body.byteLength),
        "content-type": object.contentType,
        "x-amz-meta-custom-aclpolicy": object.metadata["custom-aclpolicy"] ?? "",
      });
      res.end();
      return;
    }
    if (req.method === "GET") {
      res.writeHead(200, {
        "content-length": String(object.body.byteLength),
        "content-type": object.contentType,
      });
      res.end(object.body);
      return;
    }
    json(res, 405, { error: "method not allowed" });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  return {
    server,
    endpoint: `http://127.0.0.1:${address.port}`,
    setDeleteFailure(value: boolean) {
      failDeletes = value;
    },
  };
}

function createMemoryDb(pendingUploadsTable: object, materialsTable: object) {
  const pending = new Map<string, any>();
  const materials: any[] = [];
  const query = (table: object, projected: boolean) => {
    // The cleanup query asks only for a projected objectPath and the memory
    // database does not evaluate Drizzle predicates; return no references for
    // that query so its storage behavior can be exercised independently.
    const result = table === pendingUploadsTable
      ? [...pending.values()]
      : projected ? [] : materials.slice();
    Object.assign(result, {
      limit: async (count: number) => result.slice(0, count),
    });
    return {
      where: () => result,
    };
  };
  const db = {
    insert(table: object) {
      return {
        values(value: any) {
          return {
            onConflictDoUpdate: async () => {
              if (table === pendingUploadsTable) pending.set(value.objectPath, { ...value });
            },
          };
        },
      };
    },
    select(fields?: unknown) {
      return {
        from: (table: object) => query(table, fields !== undefined),
      };
    },
    update() {
      return { set: () => ({ where: async () => [] }) };
    },
    delete(table: object) {
      return {
        where: async () => {
          if (table === pendingUploadsTable) {
            const now = new Date();
            for (const [objectPath, upload] of pending) {
              if (upload.expiresAt <= now) pending.delete(objectPath);
            }
          }
          return { rowCount: 0 };
        },
      };
    },
    transaction: async (callback: (tx: any) => Promise<any>) => callback({
      delete(table: object) {
        return {
          where: () => ({
            returning: async () => {
              if (table !== pendingUploadsTable) return [];
              const entries = [...pending.values()];
              pending.clear();
              return entries;
            },
          }),
        };
      },
      insert(table: object) {
        return {
          values(value: any) {
            return { returning: async () => {
              if (table === materialsTable) materials.push({ ...value });
              return [{ ...value }];
            }};
          },
        };
      },
    }),
  };
  return { db, pending, materials };
}

async function request(server: Server, path: string, init: RequestInit = {}) {
  const address = server.address();
  assert(address && typeof address !== "string");
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, init);
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : null };
}

test("upload lifecycle works over HTTP with simulated Clerk and database", async (t) => {
  const s3 = await startS3();
  t.after(() => s3.server.close());
  const previousEnv = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries({ ...storageEnv, S3_ENDPOINT: s3.endpoint })) {
    previousEnv.set(name, process.env[name]);
    process.env[name] = value;
  }
  t.after(() => {
    for (const [name, value] of previousEnv) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  const dbModule = await import("@workspace/db");
  const memory = createMemoryDb(dbModule.pendingUploadsTable, dbModule.materialsTable);
  const liveDb = dbModule.db as any;
  liveDb.insert = memory.db.insert;
  liveDb.select = memory.db.select;
  liveDb.update = memory.db.update;
  liveDb.delete = memory.db.delete;
  liveDb.transaction = memory.db.transaction;
  const { setAuthResolverForTests } = await import("../middlewares/requireAuth.ts");
  setAuthResolverForTests((req) => {
    const token = req.headers.authorization;
    return token === "Bearer owner-token"
      ? "http-owner"
      : token === "Bearer other-token" ? "http-other" : undefined;
  });
  t.after(() => setAuthResolverForTests(undefined));

  const [{ default: storageRouter }, { default: materialsRouter }] = await Promise.all([
    import("./storage.ts"),
    import("./materials.ts"),
  ]);
  const { cleanupExpiredPendingUploads } = await import("./storage.ts");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).log = { warn() {}, error() {} };
    next();
  });
  app.use("/api", storageRouter);
  app.use("/api", materialsRouter);
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());

  const anonymous = await request(server, "/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "lezione.txt", size: 5, contentType: "text/plain" }),
  });
  assert.equal(anonymous.response.status, 401);

  const content = Buffer.from("ciao!");
  const upload = await request(server, "/api/storage/uploads/request-url", {
    method: "POST",
    headers: {
      authorization: "Bearer owner-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: "lezione.txt", size: content.length, contentType: "text/plain" }),
  });
  assert.equal(upload.response.status, 200);
  const uploadData = upload.body as { uploadURL: string; objectPath: string };
  assert.equal(memory.pending.size, 1);

  const put = await fetch(uploadData.uploadURL, {
    method: "PUT",
    headers: { "content-type": "text/plain" },
    body: content,
  });
  assert.equal(put.status, 200);

  const otherFinalize = await request(server, "/api/materials", {
    method: "POST",
    headers: {
      authorization: "Bearer other-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      objectPath: uploadData.objectPath,
      contentType: "text/plain",
      size: content.length,
    }),
  });
  assert.equal(otherFinalize.response.status, 403);
  assert.equal(memory.pending.size, 1);

  const finalized = await request(server, "/api/materials", {
    method: "POST",
    headers: {
      authorization: "Bearer owner-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      objectPath: uploadData.objectPath,
      contentType: "text/plain",
      size: content.length,
      description: "materiale di prova",
    }),
  });
  assert.equal(finalized.response.status, 201);
  assert.equal(memory.pending.size, 0);
  assert.equal(memory.materials.length, 1);

  const address = server.address();
  assert(address && typeof address !== "string");
  const privateReadPath = `/api/storage/objects${uploadData.objectPath.replace(/^\/objects/, "")}`;
  const ownerRead = await fetch(`http://127.0.0.1:${address.port}${privateReadPath}`, {
    headers: { authorization: "Bearer owner-token" },
  });
  assert.equal(ownerRead.status, 200);
  assert.equal(await ownerRead.text(), content.toString());

  const otherRead = await request(server, privateReadPath, {
    headers: { authorization: "Bearer other-token" },
  });
  assert.equal(otherRead.response.status, 403);

  const anonymousRead = await request(server, privateReadPath);
  assert.equal(anonymousRead.response.status, 401);

  const expiredUpload = await request(server, "/api/storage/uploads/request-url", {
    method: "POST",
    headers: {
      authorization: "Bearer owner-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: "scaduto.txt", size: content.length, contentType: "text/plain" }),
  });
  assert.equal(expiredUpload.response.status, 200);
  const expiredData = expiredUpload.body as { uploadURL: string; objectPath: string };
  const expiredPending = memory.pending.get(expiredData.objectPath);
  assert(expiredPending);
  const abandonedPut = await fetch(expiredData.uploadURL, {
    method: "PUT",
    headers: { "content-type": "text/plain" },
    body: content,
  });
  assert.equal(abandonedPut.status, 200);
  expiredPending.expiresAt = new Date(Date.now() - 1);

  const expiredFinalize = await request(server, "/api/materials", {
    method: "POST",
    headers: {
      authorization: "Bearer owner-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      objectPath: expiredData.objectPath,
      contentType: "text/plain",
      size: content.length,
    }),
  });
  assert.equal(expiredFinalize.response.status, 400);
  assert.equal(memory.pending.has(expiredData.objectPath), false);
  assert.equal(memory.materials.length, 1);

  const alteredSizeUpload = await request(server, "/api/storage/uploads/request-url", {
    method: "POST",
    headers: {
      authorization: "Bearer owner-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: "dimensione.txt", size: content.length, contentType: "text/plain" }),
  });
  assert.equal(alteredSizeUpload.response.status, 200);
  const alteredSizeData = alteredSizeUpload.body as {
    uploadURL: string;
    objectPath: string;
  };
  const alteredSizePut = await fetch(alteredSizeData.uploadURL, {
    method: "PUT",
    headers: { "content-type": "text/plain" },
    body: Buffer.from("ciao"),
  });
  assert.equal(alteredSizePut.status, 200);

  const alteredSizeFinalize = await request(server, "/api/materials", {
    method: "POST",
    headers: {
      authorization: "Bearer owner-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      objectPath: alteredSizeData.objectPath,
      contentType: "text/plain",
      size: content.length,
    }),
  });
  assert.equal(alteredSizeFinalize.response.status, 400);
  assert.equal(memory.pending.has(alteredSizeData.objectPath), true);
  memory.pending.delete(alteredSizeData.objectPath);

  const alteredTypeUpload = await request(server, "/api/storage/uploads/request-url", {
    method: "POST",
    headers: {
      authorization: "Bearer owner-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: "tipo-alterato.txt", size: content.length, contentType: "text/plain" }),
  });
  assert.equal(alteredTypeUpload.response.status, 200);
  const alteredTypeData = alteredTypeUpload.body as {
    uploadURL: string;
    objectPath: string;
  };
  const alteredTypePut = await fetch(alteredTypeData.uploadURL, {
    method: "PUT",
    headers: { "content-type": "application/octet-stream" },
    body: content,
  });
  assert.equal(alteredTypePut.status, 200);

  const alteredTypeFinalize = await request(server, "/api/materials", {
    method: "POST",
    headers: {
      authorization: "Bearer owner-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      objectPath: alteredTypeData.objectPath,
      contentType: "text/plain",
      size: content.length,
    }),
  });
  assert.equal(alteredTypeFinalize.response.status, 400);
  assert.equal(memory.pending.has(alteredTypeData.objectPath), true);

  memory.pending.set("/objects/expired-abandoned", {
    objectPath: "/objects/expired-abandoned",
    expiresAt: new Date(Date.now() - 1),
  });
  memory.pending.set("/objects/active", {
    objectPath: "/objects/active",
    expiresAt: new Date(Date.now() + 60_000),
  });
  await cleanupExpiredPendingUploads();
  assert.equal(memory.pending.has("/objects/expired-abandoned"), false);
  assert.equal(memory.pending.has("/objects/active"), true);
  const cleanupUpload = await request(server, "/api/storage/uploads/request-url", {
    method: "POST",
    headers: {
      authorization: "Bearer owner-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: "cleanup.txt", size: content.length, contentType: "text/plain" }),
  });
  assert.equal(cleanupUpload.response.status, 200);
  const cleanupData = cleanupUpload.body as { uploadURL: string; objectPath: string };
  const cleanupPut = await fetch(cleanupData.uploadURL, {
    method: "PUT",
    headers: { "content-type": "text/plain" },
    body: content,
  });
  assert.equal(cleanupPut.status, 200);
  memory.pending.get(cleanupData.objectPath).expiresAt = new Date(Date.now() - 1);
  const cleanupWarnings: unknown[][] = [];
  s3.setDeleteFailure(true);
  await cleanupExpiredPendingUploads({
    warn(...args: unknown[]) {
      cleanupWarnings.push(args);
    },
    error() {},
  });
  assert.equal(memory.pending.has(cleanupData.objectPath), true);
  assert.ok(cleanupWarnings.length > 0);
  const cleanupWarning = cleanupWarnings.find(([context]) =>
    (context as { objectPath?: string })?.objectPath === cleanupData.objectPath,
  );
  assert(cleanupWarning);
  assert.equal(cleanupWarning[1], "Impossibile eliminare upload abbandonato");

  s3.setDeleteFailure(false);
  await cleanupExpiredPendingUploads();
  assert.equal(memory.pending.has(cleanupData.objectPath), false);
  const abandonedObject = await fetch(cleanupData.uploadURL, { method: "HEAD" });
  assert.equal(abandonedObject.status, 404);
});
