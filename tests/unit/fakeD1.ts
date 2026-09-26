export interface RecordedStatement {
  sql: string;
  args: unknown[];
}

export function fakeD1() {
  const statements: RecordedStatement[] = [];
  const db = {
    prepare(sql: string) {
      return {
        sql,
        args: [] as unknown[],
        bind(...args: unknown[]) {
          this.args = args;
          return this;
        },
      };
    },
    async batch(batch: RecordedStatement[]) {
      statements.push(...batch.map(({ sql, args }) => ({ sql, args })));
      return batch.map(() => ({ results: [], meta: { changes: 1 } }));
    },
  };
  return {
    db: db as unknown as D1Database,
    statements,
    writes: () => statements.filter((statement) => /^\s*(INSERT|UPDATE|DELETE)/i.test(statement.sql)),
  };
}
