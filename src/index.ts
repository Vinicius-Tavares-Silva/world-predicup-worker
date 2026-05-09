import { runConfiguredWorkerOnce } from "./worker.js";

async function main(): Promise<void> {
  await runConfiguredWorkerOnce();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
