export class UserQuotaPolicyLogger {
  async exhausted(userId: number): Promise<void> {
    console.warn(
      "UserQuotaPolicyLogger:",
      `daily quota exhausted for user id ${userId}`,
    );
  }
}
