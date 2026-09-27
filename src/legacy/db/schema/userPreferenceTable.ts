import { CREATE_USER_PREFERENCE_TABLE } from "../sql/userPreference";

export function userPreferenceTableStatement(db: D1Database): D1PreparedStatement {
  return db.prepare(CREATE_USER_PREFERENCE_TABLE);
}
