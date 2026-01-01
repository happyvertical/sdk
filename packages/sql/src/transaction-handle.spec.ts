import { describe, expect, it } from 'vitest';
import { getDatabase, syncSchema } from './index';
import type { TransactionHandle } from './shared/types';

describe('beginTransaction', () => {
  describe('SQLite', () => {
    it('should create a transaction handle with commit/rollback methods', async () => {
      const db = await getDatabase({
        type: 'sqlite',
        url: ':memory:',
      });

      await syncSchema({
        db,
        schema: `
          CREATE TABLE users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL
          )
        `,
      });

      expect(db.beginTransaction).toBeDefined();
      const tx = await db.beginTransaction!();

      expect(tx.commit).toBeDefined();
      expect(tx.rollback).toBeDefined();
      expect(tx.isActive).toBeDefined();
      expect(tx.isActive()).toBe(true);

      await tx.rollback();
      expect(tx.isActive()).toBe(false);
    });

    it('should rollback changes when rollback is called', async () => {
      const db = await getDatabase({
        type: 'sqlite',
        url: ':memory:',
      });

      await syncSchema({
        db,
        schema: `
          CREATE TABLE users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL
          )
        `,
      });

      // Insert a record outside transaction
      await db.insert('users', { id: '1', name: 'Alice' });

      // Start transaction and insert
      const tx = await db.beginTransaction!();
      await tx.insert('users', { id: '2', name: 'Bob' });

      // Bob should be visible within the transaction
      const bobInTx = await tx.get('users', { id: '2' });
      expect(bobInTx).not.toBeNull();
      expect(bobInTx?.name).toBe('Bob');

      // Rollback the transaction
      await tx.rollback();

      // Bob should not exist after rollback
      const bobAfterRollback = await db.get('users', { id: '2' });
      expect(bobAfterRollback).toBeNull();

      // Alice should still exist
      const alice = await db.get('users', { id: '1' });
      expect(alice).not.toBeNull();
      expect(alice?.name).toBe('Alice');
    });

    it('should commit changes when commit is called', async () => {
      const db = await getDatabase({
        type: 'sqlite',
        url: ':memory:',
      });

      await syncSchema({
        db,
        schema: `
          CREATE TABLE users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL
          )
        `,
      });

      // Start transaction and insert
      const tx = await db.beginTransaction!();
      await tx.insert('users', { id: '1', name: 'Charlie' });
      await tx.commit();

      // Charlie should exist after commit
      const charlie = await db.get('users', { id: '1' });
      expect(charlie).not.toBeNull();
      expect(charlie?.name).toBe('Charlie');
    });

    it('should throw error when commit/rollback called twice', async () => {
      const db = await getDatabase({
        type: 'sqlite',
        url: ':memory:',
      });

      await syncSchema({
        db,
        schema: `
          CREATE TABLE users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL
          )
        `,
      });

      const tx = await db.beginTransaction!();
      await tx.rollback();

      await expect(tx.rollback()).rejects.toThrow('Transaction already ended');
      await expect(tx.commit()).rejects.toThrow('Transaction already ended');
    });

    it('should support multiple sequential transactions with rollback', async () => {
      const db = await getDatabase({
        type: 'sqlite',
        url: ':memory:',
      });

      await syncSchema({
        db,
        schema: `
          CREATE TABLE items (
            id TEXT PRIMARY KEY,
            value INTEGER NOT NULL
          )
        `,
      });

      // First transaction with rollback
      const tx1 = await db.beginTransaction!();
      await tx1.insert('items', { id: 'item-1', value: 100 });
      const item1 = await tx1.get('items', { id: 'item-1' });
      expect(item1?.value).toBe(100);
      await tx1.rollback();

      // Item should not persist after rollback
      const afterRollback1 = await db.get('items', { id: 'item-1' });
      expect(afterRollback1).toBeNull();

      // Second transaction with rollback
      const tx2 = await db.beginTransaction!();
      await tx2.insert('items', { id: 'item-2', value: 200 });
      const item2 = await tx2.get('items', { id: 'item-2' });
      expect(item2?.value).toBe(200);
      await tx2.rollback();

      // Item should not persist after rollback
      const afterRollback2 = await db.get('items', { id: 'item-2' });
      expect(afterRollback2).toBeNull();

      // Verify table is empty using list
      const allItems = await db.list('items', {});
      expect(allItems).toHaveLength(0);
    });
  });
});
