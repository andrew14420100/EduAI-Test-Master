import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getPendingUploadCleanupHealth } from "./storage";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  const data = HealthCheckResponse.parse({
    status: "ok",
    pendingUploadCleanup: await getPendingUploadCleanupHealth(),
  });
  res.json(data);
});

export default router;
