function guardPgClient(client, { logger = console, context = "postgres-client", onTransientError = null } = {}) {
  if (!client || typeof client.on !== "function") return () => {};
  let handled = false;
  const onError = (error) => {
    handled = true;
    logger.warn(`PostgreSQL ${context} connection error handled: ${error?.code || error?.message || "unknown-error"}`);
    if (typeof onTransientError === "function") {
      Promise.resolve(onTransientError(error)).catch((resetError) => {
        logger.error(`PostgreSQL ${context} recovery callback failed:`, resetError?.message || resetError);
      });
    }
  };
  client.on("error", onError);
  return () => {
    if (!handled && typeof client.removeListener === "function") client.removeListener("error", onError);
  };
}

module.exports = guardPgClient;
