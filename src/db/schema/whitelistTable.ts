import { CREATE_WHITELIST_TABLE } from "../sql/whitelist";

export function whitelistTableStatement(db: D1Database): D1PreparedStatement {
  return db.prepare(CREATE_WHITELIST_TABLE);
}
