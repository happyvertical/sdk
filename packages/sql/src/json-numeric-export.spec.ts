import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearConnectionCache, getDatabase } from './index';

describe('JSON adapter numeric field export (Issue #694)', () => {
  let db: any;
  const testDataDir = './test-json-numeric';

  beforeEach(async () => {
    mkdirSync(testDataDir, { recursive: true });

    // Create initial JSON with numeric fields
    writeFileSync(
      `${testDataDir}/locations.json`,
      JSON.stringify([
        {
          id: 'loc-1',
          name: 'Town of Bentley',
          latitude: 52.4667,
          longitude: -114.0833,
          population: 1082,
          elevation: 850.5,
          active: true,
        },
      ]),
    );

    // Initialize with schema that has numeric types
    db = await getDatabase({
      type: 'json',
      url: testDataDir,
      writeStrategy: 'immediate',
      schemas: {
        locations: {
          tableName: 'locations',
          ddl: `CREATE TABLE locations (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            latitude DOUBLE,
            longitude DOUBLE,
            population INTEGER,
            elevation REAL,
            active BOOLEAN
          )`,
        },
      },
    });
  });

  afterEach(async () => {
    clearConnectionCache();
    rmSync(testDataDir, { recursive: true, force: true });
  });

  it('should export numeric fields as numbers, not strings', async () => {
    // Insert a new location with numeric values
    await db.insert('locations', {
      id: 'loc-2',
      name: 'City of Red Deer',
      latitude: 52.2681,
      longitude: -113.8112,
      population: 100418,
      elevation: 905.0,
      active: true,
    });

    // Read the exported JSON file
    const jsonContent = readFileSync(`${testDataDir}/locations.json`, 'utf-8');
    const locations = JSON.parse(jsonContent);

    // Find the newly inserted location
    const redDeer = locations.find((loc: any) => loc.id === 'loc-2');

    expect(redDeer).toBeDefined();

    // Verify numeric fields are numbers, not strings
    expect(typeof redDeer.latitude).toBe('number');
    expect(typeof redDeer.longitude).toBe('number');
    expect(typeof redDeer.population).toBe('number');
    expect(typeof redDeer.elevation).toBe('number');

    // Verify the actual values
    expect(redDeer.latitude).toBe(52.2681);
    expect(redDeer.longitude).toBe(-113.8112);
    expect(redDeer.population).toBe(100418);
    expect(redDeer.elevation).toBe(905.0);
  });

  it('should preserve numeric fields through upsert', async () => {
    // Upsert an existing location with updated numeric values
    await db.upsert('locations', ['id'], {
      id: 'loc-1',
      name: 'Town of Bentley (Updated)',
      latitude: 52.4668,
      longitude: -114.0834,
      population: 1100,
      elevation: 851.0,
      active: false,
    });

    // Read the exported JSON file
    const jsonContent = readFileSync(`${testDataDir}/locations.json`, 'utf-8');
    const locations = JSON.parse(jsonContent);

    const bentley = locations.find((loc: any) => loc.id === 'loc-1');

    expect(bentley).toBeDefined();

    // Verify numeric fields are still numbers after upsert
    expect(typeof bentley.latitude).toBe('number');
    expect(typeof bentley.longitude).toBe('number');
    expect(typeof bentley.population).toBe('number');
    expect(typeof bentley.elevation).toBe('number');

    // Verify updated values
    expect(bentley.latitude).toBe(52.4668);
    expect(bentley.longitude).toBe(-114.0834);
    expect(bentley.population).toBe(1100);
    expect(bentley.elevation).toBe(851.0);
  });

  it('should handle mixed text and numeric fields correctly', async () => {
    // Insert a location
    await db.insert('locations', {
      id: 'loc-3',
      name: 'Edmonton',
      latitude: 53.5461,
      longitude: -113.4938,
      population: 1010899,
      elevation: 668.0,
      active: true,
    });

    const jsonContent = readFileSync(`${testDataDir}/locations.json`, 'utf-8');
    const locations = JSON.parse(jsonContent);
    const edmonton = locations.find((loc: any) => loc.id === 'loc-3');

    // Text fields should be strings
    expect(typeof edmonton.id).toBe('string');
    expect(typeof edmonton.name).toBe('string');

    // Numeric fields should be numbers
    expect(typeof edmonton.latitude).toBe('number');
    expect(typeof edmonton.longitude).toBe('number');
    expect(typeof edmonton.population).toBe('number');
    expect(typeof edmonton.elevation).toBe('number');
  });
});
