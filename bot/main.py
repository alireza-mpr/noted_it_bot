import logging
import os

from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("Hello, world!")


def main() -> None:
    token = os.environ["BOT_TOKEN"]

    application = Application.builder().token(token).build()
    application.add_handler(CommandHandler("start", start))

    logger.info("Bot starting (polling)...")
    application.run_polling()


if __name__ == "__main__":
    main()
