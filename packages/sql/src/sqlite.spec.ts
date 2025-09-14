import { it, expect, describe, beforeEach, afterEach } from "bun:test";
import { randomUUID } from "node:crypto";
import { getDatabase } from "./index.js";
// import type { Database } from "./types";

describe("sqlite tests", () => {
  let db: any;

  beforeEach(async () => {
    db = await getDatabase({
      type: "sqlite",
    });
    await db.execute`
      create table contents (
        id uuid primary key not null,
        title text, 
        body text
      )
    `;
  });

  afterEach(async () => {
    await db.execute`
      drop table contents
    `;
  });

  it("should be able to perform a statement", async () => {
    const result = await db.many`
      select * from contents
    `;
    expect(result).toEqual([]);
  });

  it("should be able to insert data", async () => {
    const data = {
      id: randomUUID(),
      title: "hello",
      body: "world",
    } as const;
    const inserted = await db.insert("contents", data);
    expect(inserted).toBeDefined();
  });

  it("should be able to query data with a condition", async () => {
    const data = {
      id: randomUUID(),
      title: "hello",
      body: "world",
    } as const;
    await db.insert("contents", data);
    const result = await db.single`
      select * from contents where id = ${data.id}
    `;
    expect(result).toEqual({
      id: data.id,
      title: data.title,
      body: data.body,
    });
  });

  it("should be able to update a row", async () => {
    const data = {
      id: randomUUID(),
      title: "hello",
      body: "world",
    } as const;
    await db.insert("contents", data);
    await db.update(
      "contents",
      { id: data.id },
      { title: "hi", body: "universe" },
    );
    const result = await db.single`
      select * from contents where id = ${data.id}
    `;
    expect(result).toEqual({ id: data.id, title: "hi", body: "universe" });
  });
});
