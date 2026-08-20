import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, test } from "node:test";

import adminAuthRouter from "./adminAuth.ts";
import { adminSessions, requireAdminSession } from "../middlewares/requireAuth.ts";

const TEST_SECRET = "test-admin-bootstrap-secret";
const here = path.dirname(fileURLToPath(import.meta.url));

function createTestServer(): Server {
  const app = express();
  app.use(express.json());
  app.use("/api", adminAuthRouter);
  app.get("/api/admin/probe", requireAdminSession, (_req, res) => {
    res.json({ authorized: true });
  });
  return createServer(app);
}

async function request(
  server: Server,
  pathName: string,
  options: RequestInit = {},
): Promise<{ response: Response; body: unknown }> {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const response = await fetch(`http://127.0.0.1:${address.port}${pathName}`, options);
  const text = await response.text();
  return {
    response,
    body: text ? JSON.parse(text) : null,
  };
}

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

beforeEach(() => {
  process.env.ADMIN_BOOTSTRAP_SECRET = TEST_SECRET;
  adminSessions.clear();
});

afterEach(() => {
  delete process.env.ADMIN_BOOTSTRAP_SECRET;
  adminSessions.clear();
});

test("an invalid admin code is rejected and does not create a session", async () => {
  const server = createTestServer();
  await listen(server);
  try {
    const { response, body } = await request(server, "/api/admin/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: "wrong-code" }),
    });

    assert.equal(response.status, 401);
    assert.deepEqual(body, { error: "Codice amministratore non valido" });
    assert.equal(adminSessions.size, 0);
  } finally {
    await close(server);
  }
});

test("a valid session can access protected admin routes", async () => {
  const server = createTestServer();
  await listen(server);
  try {
    const login = await request(server, "/api/admin/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: TEST_SECRET }),
    });
    assert.equal(login.response.status, 200);
    const sessionToken = (login.body as { sessionToken: string }).sessionToken;
    assert.ok(sessionToken);

    const session = await request(server, "/api/admin/auth/session", {
      headers: { "x-admin-session": sessionToken },
    });
    assert.equal(session.response.status, 200);
    assert.deepEqual(session.body, { authenticated: true });

    const protectedRoute = await request(server, "/api/admin/probe", {
      headers: { "x-admin-session": sessionToken },
    });
    assert.equal(protectedRoute.response.status, 200);
    assert.deepEqual(protectedRoute.body, { authorized: true });
  } finally {
    await close(server);
  }
});

test("an expired session is rejected and removed", async () => {
  const expiredToken = "expired-session";
  adminSessions.set(expiredToken, { adminId: "admin", expiresAt: Date.now() - 1 });
  const server = createTestServer();
  await listen(server);
  try {
    const { response, body } = await request(server, "/api/admin/auth/session", {
      headers: { "x-admin-session": expiredToken },
    });

    assert.equal(response.status, 401);
    assert.deepEqual(body, { error: "Sessione amministratore scaduta" });
    assert.equal(adminSessions.has(expiredToken), false);
  } finally {
    await close(server);
  }
});

test("logout revokes the session", async () => {
  const server = createTestServer();
  await listen(server);
  try {
    const login = await request(server, "/api/admin/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: TEST_SECRET }),
    });
    const sessionToken = (login.body as { sessionToken: string }).sessionToken;

    const logout = await request(server, "/api/admin/auth/logout", {
      method: "POST",
      headers: { "x-admin-session": sessionToken },
    });
    assert.equal(logout.response.status, 204);
    assert.equal(adminSessions.has(sessionToken), false);

    const afterLogout = await request(server, "/api/admin/auth/session", {
      headers: { "x-admin-session": sessionToken },
    });
    assert.equal(afterLogout.response.status, 401);
  } finally {
    await close(server);
  }
});

test("admin ticket routes remain protected by the admin session middleware", () => {
  const source = fs.readFileSync(path.join(here, "tickets.ts"), "utf8");
  const adminRoutes = source.match(/router\.(?:get|post)\("\/admin\/[^"]+"/g) ?? [];

  assert.ok(adminRoutes.length > 0, "expected admin ticket routes");
  for (const route of adminRoutes) {
    const routeStart = source.indexOf(route);
    const nextRoute = source.indexOf("\nrouter.", routeStart + route.length);
    const routeSource = source.slice(routeStart, nextRoute === -1 ? undefined : nextRoute);
    assert.match(routeSource, /requireAdminSession/, `${route} must require an admin session`);
  }
});