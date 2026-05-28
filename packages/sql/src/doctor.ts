/**
 * Database integrity-check framework.
 *
 * The runner is a thin loop over user-supplied checks; the value here is
 * the reusable check builders (expected tables, unique columns, FK-like
 * relationships) that codify the common shapes of integrity bugs that
 * sneak past schema migrations.
 *
 * No SMRT awareness — checks operate on the `DatabaseInterface` from this
 * package and on plain table/column names.
 *
 * **Postgres-only today.** The bundled check builders and
 * `listPublicTables` use Postgres syntax (`pg_tables`, `::int`/`::text`
 * casts). The shape is portable in principle — `DoctorContext` carries a
 * generic `DatabaseInterface` so apps can add engine-aware checks — but
 * the out-of-the-box runner expects a Postgres connection. `runDoctor`
 * throws early if pointed at a non-Postgres URL rather than failing
 * mid-execution with a confusing `pg_tables`-doesn't-exist error.
 */
import { redactDatabaseUrl } from './postgres-cli';
import type { DatabaseInterface } from './shared/types';

export type DoctorLevel = 'fail' | 'warn';

export interface DoctorIssue {
  level: DoctorLevel;
  message: string;
}

export interface DoctorContext {
  db: DatabaseInterface;
  tables: Set<string>;
}

export type DoctorCheck = (ctx: DoctorContext) => Promise<DoctorIssue[]>;

export interface RunDoctorOptions {
  db: DatabaseInterface;
  checks: DoctorCheck[];
}

export interface DoctorResult {
  failures: DoctorIssue[];
  warnings: DoctorIssue[];
  issues: DoctorIssue[];
}

/**
 * Execute every check against the public-schema tables of `db` and
 * partition the results by severity. Returns the aggregate; callers
 * format/exit as they see fit.
 *
 * The current table set is enumerated once and shared across checks so
 * each check can cheaply decide whether its target tables exist.
 */
export async function runDoctor(
  options: RunDoctorOptions,
): Promise<DoctorResult> {
  assertPostgresAdapter(options.db);
  const tables = await listPublicTables(options.db);
  const issues: DoctorIssue[] = [];

  for (const check of options.checks) {
    const checkIssues = await check({ db: options.db, tables });
    issues.push(...checkIssues);
  }

  return {
    failures: issues.filter((issue) => issue.level === 'fail'),
    warnings: issues.filter((issue) => issue.level === 'warn'),
    issues,
  };
}

/**
 * Throw early if the supplied database isn't Postgres. The check builders
 * and `listPublicTables` use Postgres syntax; pointing them at SQLite or
 * DuckDB would fail mid-execution with a confusing "table pg_tables does
 * not exist" error from the adapter. Fail fast with a useful message
 * instead.
 */
function assertPostgresAdapter(db: DatabaseInterface): void {
  const url = String(db.url ?? '');
  if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
    throw new Error(
      `runDoctor requires a Postgres database connection. Got URL: ${url ? redactDatabaseUrl(url) : '(empty)'}. ` +
        'The bundled check builders use Postgres-specific syntax (pg_tables, ::int/::text casts).',
    );
  }
}

/**
 * Emit a 'warn' for each table in `expected` that's missing.
 *
 * Marked as `warn` rather than `fail` because a missing table often
 * indicates a migration that hasn't been run yet, not active data
 * corruption — callers can promote to fail by mapping the issues.
 */
export function checkExpectedTables(expected: readonly string[]): DoctorCheck {
  return async ({ tables }) => {
    const issues: DoctorIssue[] = [];
    for (const table of expected) {
      if (!tables.has(table)) {
        issues.push({
          level: 'warn',
          message: `Missing expected table: ${table}`,
        });
      }
    }
    return issues;
  };
}

export interface UniqueColumnSpec {
  table: string;
  column: string;
  /** Human-readable label used in the issue message. */
  label: string;
}

/**
 * Emit a 'fail' for each value that appears more than once in
 * `(table, column)` (ignoring NULL and empty-string values).
 *
 * Useful for catching slug/key collisions that the schema didn't
 * declare a UNIQUE constraint for (or where the constraint was added
 * after data already existed).
 */
export function checkUniqueColumn(spec: UniqueColumnSpec): DoctorCheck {
  return async ({ db, tables }) => {
    if (!tables.has(spec.table)) return [];
    const result = await db.query(`
      SELECT ${quoteIdentifier(spec.column)} AS value, count(*)::text AS count
      FROM ${quoteIdentifier(spec.table)}
      WHERE NULLIF(trim(${quoteIdentifier(spec.column)}::text), '') IS NOT NULL
      GROUP BY ${quoteIdentifier(spec.column)}
      HAVING count(*) > 1
      ORDER BY count DESC, ${quoteIdentifier(spec.column)}
    `);
    return result.rows.map((row) => ({
      level: 'fail' as const,
      message: `Duplicate ${spec.label} "${String(row.value)}" in ${spec.table} (${countValueFromRow(
        row.count,
      )} rows).`,
    }));
  };
}

export interface RelationshipSpec {
  childTable: string;
  childColumn: string;
  parentTable: string;
  /** Defaults to 'id'. */
  parentColumn?: string;
  /** Human-readable label used in the issue message. */
  label: string;
}

/**
 * Emit a 'fail' counting orphan rows where the child column points at a
 * parent row that doesn't exist (FK-shaped check, but doesn't require an
 * actual FK constraint to be declared — useful for soft references like
 * tag-id-or-slug lookup columns).
 */
export function checkRelationship(spec: RelationshipSpec): DoctorCheck {
  return async ({ db, tables }) => {
    if (!tables.has(spec.childTable) || !tables.has(spec.parentTable))
      return [];
    const parentColumn = spec.parentColumn ?? 'id';
    const result = await db.query(`
      SELECT count(*)::text AS count
      FROM ${quoteIdentifier(spec.childTable)} child
      LEFT JOIN ${quoteIdentifier(spec.parentTable)} parent
        ON parent.${quoteIdentifier(parentColumn)} = child.${quoteIdentifier(spec.childColumn)}
      WHERE NULLIF(trim(child.${quoteIdentifier(spec.childColumn)}::text), '') IS NOT NULL
        AND parent.${quoteIdentifier(parentColumn)} IS NULL
    `);
    const orphanCount = countValueFromRow(result.rows[0]?.count);
    if (orphanCount === '0') return [];
    return [
      {
        level: 'fail',
        message: `${spec.label}: ${orphanCount} orphaned row${orphanCount === '1' ? '' : 's'}.`,
      },
    ];
  };
}

async function listPublicTables(db: DatabaseInterface): Promise<Set<string>> {
  const result = await db.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  return new Set(result.rows.map((row) => String(row.tablename ?? '')));
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/gu, '""')}"`;
}

function countValueFromRow(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return '0';
}
