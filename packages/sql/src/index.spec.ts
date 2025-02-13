import { it, describe, expect } from "vitest";
import { getDatabase } from "./index.js";
import path from "path";
import { tmpdir } from "os";
import { syncSchema } from "./index.js";
const TMP_DIR = path.resolve(`${tmpdir()}/kissd`);

describe("sqloo tests", () => {
  it.skip("should be able to get the adapter for a postgres database", async () => {
    const db = await getDatabase({
      type: "postgres",
      database: process.env.SQLOO_NAME || "sqloo",
      host: process.env.SQLOO_HOST || "localhost",
      user: process.env.SQLOO_USER || "sqloo",
      password: process.env.SQLOO_PASS || "sqloo",
      port: Number(process.env.SQLOO_PORT) || 5432,
    });
    expect(db.client).toBeDefined();
  });

  it("should be able to get the adapter for a sqlite database", async () => {
    const db = await getDatabase({
      type: "sqlite",
    });
    expect(db.client).toBeDefined();
  });

  it("should be able to sync a table schema", async () => {
    const db = await getDatabase({
      type: "sqlite",
    });
    // console.log({ db });
    await syncSchema({
      db,
      schema: `
        CREATE TABLE test (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT
        )
      `,
    });
    // const result = await db
    //   .insert("contents", {
    //     name: "testestestes",
    //   })
    //   .values({ name: "test" });

    // expect(result).toBeDefined();
  });
});
