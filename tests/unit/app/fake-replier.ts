import type { Replier } from "../../../src/adapters/telegram/replier";
import type { LinkButton } from "../../../src/adapters/telegram/telegram-client";
import type { CalendarFile } from "../../../src/output/calendar-file";

// Represents a replier that keeps what it sends.
export class FakeReplier implements Replier {
  readonly texts: string[] = [];
  readonly linkButtons: LinkButton[] = [];
  readonly calendarFiles: { calendarFile: CalendarFile; htmlCaption: string }[] = [];

  async sendText(text: string): Promise<void> {
    this.texts.push(text);
  }

  async sendTextWithLinkButton(text: string, linkButton: LinkButton): Promise<void> {
    this.texts.push(text);
    this.linkButtons.push(linkButton);
  }

  async sendCalendarFile(calendarFile: CalendarFile, htmlCaption: string): Promise<void> {
    this.calendarFiles.push({ calendarFile, htmlCaption });
  }
}
