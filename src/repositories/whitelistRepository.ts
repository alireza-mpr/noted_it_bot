import type { WhitelistRow } from "../db/schema/whitelistRow";
import { whitelistTableStatement } from "../db/schema/whitelistTable";
import { SELECT_WHITELISTED_USER } from "../db/sql/whitelist";

export class WhitelistRepository {
  constructor(private readonly db: D1Database) {}

  async isWhitelisted(userId: number): Promise<boolean> {
    const results = await this.run<WhitelistRow>([
      this.db.prepare(SELECT_WHITELISTED_USER).bind(userId),
    ]);
    return results[1].results.length > 0;
  }

  private async run<T = unknown>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]> {
    return this.db.batch<T>([whitelistTableStatement(this.db), ...statements]);
  }
}
