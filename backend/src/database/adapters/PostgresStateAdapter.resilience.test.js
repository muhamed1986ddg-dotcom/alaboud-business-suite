const assert = require("assert");
const PostgresStateAdapter = require("./PostgresStateAdapter");

assert.equal(PostgresStateAdapter.isTransientPostgresError({ code: "57P03" }), true);
assert.equal(PostgresStateAdapter.isTransientPostgresError({ message: "the database system is in recovery mode" }), true);
assert.equal(PostgresStateAdapter.isTransientPostgresError({ message: "syntax error at or near SELECT" }), false);

const delays = [1, 2, 3, 4, 5].map((attempt) => PostgresStateAdapter.retryDelay(attempt, 500, 16000));
assert(delays[0] >= 500 && delays[0] < 600);
assert(delays[1] >= 1000 && delays[1] < 1200);
assert(delays[4] >= 8000 && delays[4] < 9200);

console.log("PostgreSQL resilience classification/backoff tests passed");
