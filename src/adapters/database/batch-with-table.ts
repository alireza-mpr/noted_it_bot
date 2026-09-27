// Runs the statements in one batch, after creating their table if it does not
// exist yet. Returns the statements' results, without the table's.
export async function batchWithTable<Row = unknown>(
  d1Database: D1Database,
  createTableSql: string,
  statements: D1PreparedStatement[],
): Promise<D1Result<Row>[]> {
  const d1Results = await d1Database.batch<Row>([
    d1Database.prepare(createTableSql),
    ...statements,
  ]);
  return d1Results.slice(1);
}
