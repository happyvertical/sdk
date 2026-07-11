import assert from 'node:assert/strict';
import test from 'node:test';
import {
  databaseEpoch,
  expiredDatabaseNames,
} from './cleanup-ci-postgres.mjs';

test('recognizes only SDK CI database names', () => {
  assert.equal(databaseEpoch('sdk_ci_1700000000_1_1_sql_42'), 1_700_000_000);
  assert.equal(databaseEpoch('postgres'), null);
  assert.equal(databaseEpoch('smrt_ci_1700000000_1_1_core_42'), null);
});

test('selects abandoned databases older than six hours', () => {
  const now = 1_700_100_000;
  assert.deepEqual(
    expiredDatabaseNames(
      [
        `sdk_ci_${now - 21_601}_1_1_sql_1`,
        `sdk_ci_${now - 21_600}_2_1_sql_2`,
        `sdk_ci_${now - 60}_3_1_sql_3`,
        'production',
      ],
      now,
    ),
    [`sdk_ci_${now - 21_601}_1_1_sql_1`],
  );
});
