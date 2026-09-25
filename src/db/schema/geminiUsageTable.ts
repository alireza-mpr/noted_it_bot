import { CREATE_GEMINI_USAGE_TABLE } from "../sql/geminiUsage";

export function geminiUsageTableStatement(db: D1Database): D1PreparedStatement {
  return db.prepare(CREATE_GEMINI_USAGE_TABLE);
}
