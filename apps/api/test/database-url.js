// Derives the test database URL from DATABASE_URL: .../pinforth -> .../pinforth_test
export function toTestDatabaseUrl(databaseUrl) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL or TEST_DATABASE_URL must be set to run tests");
  }

  const url = new URL(databaseUrl);
  const name = url.pathname.replace(/^\//, "");

  url.pathname = `/${name.endsWith("_test") ? name : `${name}_test`}`;

  return url.toString();
}

export function assertTestDatabase(databaseUrl) {
  const name = new URL(databaseUrl).pathname.replace(/^\//, "");

  // Guard against ever migrating or truncating a real database.
  if (!name.endsWith("_test")) {
    throw new Error(`Refusing to use "${name}" for tests: name must end with _test`);
  }

  return name;
}
