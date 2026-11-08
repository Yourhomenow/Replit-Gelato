import app from "./app";
import { logger } from "./lib/logger";
import { branchesTable, db } from "@workspace/db";
import { syncMenuAvailabilityFromStock } from "./lib/stock-availability";

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

async function start(): Promise<void> {
  const branches = await db.select({ id: branchesTable.id }).from(branchesTable);
  for (const branch of branches) await syncMenuAvailabilityFromStock(branch.id);
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}

start().catch((err) => {
  logger.error({ err }, "Could not prepare menu availability");
  process.exit(1);
});
