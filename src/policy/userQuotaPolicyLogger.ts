import { Logger } from "../logging/logger";

export class UserQuotaPolicyLogger {
  constructor(
    private readonly logger: Logger = new Logger("userQuotaPolicyLogger"),
  ) {}

  async exhausted(userId: number): Promise<void> {
    this.logger.warn(`daily quota exhausted for user id ${userId}`, { userId });
  }
}
