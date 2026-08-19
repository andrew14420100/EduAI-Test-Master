import app from "./app";
import { logger } from "./lib/logger";
import { seedLabExercisesIfEmpty } from "./lib/labSeed";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Seed lab exercises in development if the table is empty (non-blocking)
  if (process.env["NODE_ENV"] !== "production") {
    seedLabExercisesIfEmpty().catch((err) => {
      logger.error({ err }, "Lab seed failed");
    });
  }
});
