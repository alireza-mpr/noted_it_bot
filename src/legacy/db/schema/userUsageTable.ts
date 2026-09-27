import { CREATE_USER_USAGE_TABLE } from "../sql/userUsage";

export function userUsageTableStatement(db: D1Database): D1PreparedStatement {
  return db.prepare(CREATE_USER_USAGE_TABLE);
}
