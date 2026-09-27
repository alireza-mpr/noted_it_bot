import { CREATE_GROQ_USAGE_TABLE } from "../sql/groqUsage";

export function groqUsageTableStatement(db: D1Database): D1PreparedStatement {
  return db.prepare(CREATE_GROQ_USAGE_TABLE);
}
