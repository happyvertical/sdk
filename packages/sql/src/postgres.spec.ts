import { it, expect, describe, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { getDatabase } from "./index.js";
describe.skip("postgres tests", () => {
  let db: Awaited<ReturnType<typeof getDatabase>>;
  beforeEach(async () => {
    db = await getDatabase({
      type: "postgres",
      database: process.env.SQLOO_NAME || "sqloo",
      host: process.env.SQLOO_HOST || "localhost",
      user: process.env.SQLOO_USER || "sqloo",
      password: process.env.SQLOO_PASS || "sqloo",
      port: Number(process.env.SQLOO_PORT) || 5432,
    });

    await db.execute`
      create extension if not exists "uuid-ossp";
      drop table if exists contents;
      create table contents (
        id uuid primary key not null default (uuid_generate_v4()),
        title text, 
        body text
      )
    `;
  });

  afterEach(async () => {
    await db.execute`drop table contents`;
    await db.client.end();
  });

  it("should be able to perform a statement", async () => {
    const result = await db.many`
      select * from contents
    `;
    expect(result).toEqual(expect.arrayContaining([]));
  });

  it("should be able to insert data", async () => {
    const inserted = await db.insert("contents", {
      title: "hello",
      body: "world",
    });
    expect(inserted).toBeDefined();
    expect(inserted.affected).toBe(1);
  });

  it("should be able to insert multiple rows at a time", async () => {
    const inserted = await db.insert("contents", [
      {
        title: "hello",
        body: "world",
      },
      {
        title: "hi",
        body: "universe",
      },
    ]);
    expect(inserted.affected).toBe(2);
  });

  it("should be able to query data with a condition", async () => {
    await db.insert("contents", { title: "hello", body: "world" });
    const result = await db.many`
      select * from contents where title = ${"hello"}
    `;
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        title: "hello",
        body: "world",
      }),
    );
  });

  it("should be able to get a single row", async () => {
    await db.insert("contents", { title: "hello", body: "world" });
    const result = await db.single`
      select * from contents where title = ${"hello"}
    `;
    expect(result).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        title: "hello",
        body: "world",
      }),
    );
  });

  it("should be able to update a row", async () => {
    const id = randomUUID();
    const inserted = await db.insert("contents", {
      id,
      title: "hello",
      body: "world",
    });
    expect(inserted.affected).toBe(1);
    const updated = await db.update(
      "contents",
      { id },
      { title: "hi", body: "universe" },
    );
    expect(updated.affected).toBe(1);
    const result = await db.oO`
      select * from contents where id = ${id}
    `;
    expect(result?.id).toEqual(id);
    expect(result?.title).toEqual("hi");
    expect(result?.body).toEqual("universe");
  });
});
