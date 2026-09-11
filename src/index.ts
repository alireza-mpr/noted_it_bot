import { Telegraf } from "telegraf";

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error("BOT_TOKEN environment variable is required");
}

const bot = new Telegraf(token);

bot.command("hi", (ctx) => {
  const userName = ctx.from.first_name;
  const currentTime = new Date().toLocaleString();
  ctx.reply(`Hi ${userName}, current time is: ${currentTime}`);
});

bot.launch();
console.log("Bot starting (polling)...");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
