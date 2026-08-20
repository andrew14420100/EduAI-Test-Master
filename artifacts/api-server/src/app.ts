import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

function toOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const allowedOrigins = new Set(
  [
    process.env.REPLIT_EXPO_DEV_DOMAIN,
    process.env.REPLIT_DEV_DOMAIN,
    ...(process.env.CORS_ALLOWED_ORIGINS?.split(",") ?? []),
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(toOrigin),
);

const isLocalDevelopmentOrigin = (origin: string) =>
  process.env.NODE_ENV !== "production"
  && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk proxy must be before body parsers (streams raw bytes)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(
  cors({
    credentials: false,
    origin(origin, callback) {
      const allowed = !origin
        || allowedOrigins.has(origin.replace(/\/+$/, ""))
        || isLocalDevelopmentOrigin(origin);
      callback(null, allowed);
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Resolve publishable key from incoming request host so the same server can
// serve multiple Clerk custom domains.
app.use(
  clerkMiddleware({
    // The mobile app signs tokens with the single Replit-managed Clerk
    // publishable key. Do not infer a different key from the proxied host:
    // the preview host is not a Clerk frontend API domain.
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  }),
);

app.use("/api", router);

export default app;
