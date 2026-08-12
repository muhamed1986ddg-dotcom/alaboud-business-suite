"use strict";

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function waitForHttpClose(server) {
  return new Promise((resolve, reject) => {
    try {
      server.close(error => error ? reject(error) : resolve());
    } catch (error) {
      reject(error);
    }
  });
}

function withTimeout(operation, timeoutMs, label) {
  const budget = Math.max(1, Math.floor(timeoutMs));
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${budget}ms`)), budget);
  });
  return Promise.race([Promise.resolve().then(operation), timeout])
    .finally(() => { if (timer) clearTimeout(timer); });
}

function createGracefulShutdown({
  getServer,
  flushStore,
  closeStore,
  stopTelemetry,
  onShutdownStart = () => {},
  logger = console,
  exit = code => process.exit(code),
  now = () => Date.now(),
  totalTimeoutMs = 8000,
  httpDrainTimeoutMs = 1500,
  telemetryTimeoutMs = 750,
  poolCloseTimeoutMs = 750,
  exitReserveMs = 250
}) {
  // Cloud Run sends SIGKILL ten seconds after SIGTERM. Keep a hard margin for
  // log delivery and process exit even when environment overrides are unsafe.
  const totalBudget = Math.min(8500, positiveInteger(totalTimeoutMs, 8000));
  const httpBudgetLimit = positiveInteger(httpDrainTimeoutMs, 1500);
  const telemetryBudgetLimit = positiveInteger(telemetryTimeoutMs, 750);
  const poolCloseBudgetLimit = positiveInteger(poolCloseTimeoutMs, 750);
  const exitReserve = Math.min(1000, positiveInteger(exitReserveMs, 250));
  let shutdownPromise = null;

  async function runPhase(name, operation, budgetMs, { critical = false } = {}) {
    const phaseStartedAt = now();
    if (budgetMs <= 0) {
      logger.warn(`Shutdown phase ${name} skipped: no time remains`);
      return { ok: false, skipped: true, durationMs: 0 };
    }
    try {
      await withTimeout(operation, budgetMs, `Shutdown phase ${name}`);
      const durationMs = Math.max(0, now() - phaseStartedAt);
      logger.log(`Shutdown phase ${name} completed in ${durationMs}ms`);
      return { ok: true, durationMs };
    } catch (error) {
      const durationMs = Math.max(0, now() - phaseStartedAt);
      const message = `Shutdown phase ${name} failed after ${durationMs}ms: ${error.message}`;
      if (critical) logger.error(message); else logger.warn(message);
      return { ok: false, durationMs, error };
    }
  }

  function shutdown(signal = "SIGTERM") {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      const startedAt = now();
      const deadline = startedAt + totalBudget;
      let exitRequested = false;
      let exitCode = 0;
      const remaining = () => Math.max(0, deadline - now() - exitReserve);
      const requestExit = code => {
        if (exitRequested) return;
        exitRequested = true;
        exit(code);
      };
      const hardStop = setTimeout(() => {
        logger.error(`Graceful shutdown hard deadline reached after ${totalBudget}ms`);
        requestExit(1);
      }, totalBudget);

      logger.log(`${signal} received: flushing database writes (bounded graceful shutdown, budget=${totalBudget}ms)`);
      try {
        onShutdownStart();

        const server = getServer?.();
        if (server) {
          const httpBudget = Math.min(httpBudgetLimit, remaining());
          const httpResult = await runPhase("http-drain", () => waitForHttpClose(server), httpBudget);
          if (!httpResult.ok) server.closeIdleConnections?.();
        }

        // Durable financial writes are critical. Reserve only short windows for
        // best-effort telemetry and pool close, and give the rest to confirming
        // write-behind plus saveDurable before either can touch the connection.
        const telemetryReserve = Math.min(telemetryBudgetLimit, remaining());
        const poolCloseReserve = Math.min(poolCloseBudgetLimit, Math.max(0, remaining() - telemetryReserve));
        const databaseFlushBudget = Math.max(0, remaining() - telemetryReserve - poolCloseReserve);
        const databaseFlushResult = await runPhase(
          "database-flush",
          () => flushStore({ timeoutMs: databaseFlushBudget }),
          databaseFlushBudget,
          { critical: true }
        );
        if (!databaseFlushResult.ok) exitCode = 1;

        const telemetryBudget = Math.min(telemetryBudgetLimit, remaining());
        await runPhase(
          "telemetry",
          () => stopTelemetry({ timeoutMs: telemetryBudget }),
          telemetryBudget
        );

        const poolCloseBudget = Math.min(poolCloseBudgetLimit, remaining());
        const poolCloseResult = await runPhase(
          "database-close",
          () => closeStore({ timeoutMs: poolCloseBudget, skipFlush: true }),
          poolCloseBudget,
          { critical: true }
        );
        if (!poolCloseResult.ok) exitCode = 1;

        server?.closeIdleConnections?.();
      } catch (error) {
        exitCode = 1;
        logger.error(`Graceful shutdown failed: ${error.stack || error.message || error}`);
      } finally {
        clearTimeout(hardStop);
        const durationMs = Math.max(0, now() - startedAt);
        logger.log(`Graceful shutdown completed in ${durationMs}ms (budget=${totalBudget}ms, exitCode=${exitCode})`);
        requestExit(exitCode);
      }
      return { exitCode, durationMs: Math.max(0, now() - startedAt) };
    })();
    return shutdownPromise;
  }

  return { shutdown, isShuttingDown: () => Boolean(shutdownPromise) };
}

module.exports = { createGracefulShutdown, withTimeout, waitForHttpClose };
