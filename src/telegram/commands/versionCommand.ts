import type { CommandHandler } from "../botContext";

export const versionCommand: CommandHandler = async ({ env, replier }) => {
  await replier.sendPlain(env.APP_VERSION);
};
