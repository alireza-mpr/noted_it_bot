import { env } from "cloudflare:test";
import { it } from "vitest";
import eventExtractPrompt from "../../src/prompts/event_extract.txt";
import { EVENT_SCHEMA } from "../../src/extractedEvents/event_schema";
import { GroqClient } from "../../src/providers/groq/groqClient";
import { GROQ_MODELS } from "../../src/providers/registry";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CYCLING = `سلام دوستان. 

شنبه هفته آینده ۲۶ سپتامبر هر کس دوست داره دوچرخه سواری کنه، لطفا در آدرس زیر حضور داشته باشید:

https://maps.app.goo.gl/fM2MRGw4Fbx4nJc46?g_st=ic

دوستانی که هم امکان دوچرخه ندارن و دوست دارن پیادهروی کنند، این مسیر مناسب این کار هم هست.
 
مسیر در واقع جاده قدیم واربرتون هست که خیلی هم معروفه و با بعضی دوستان قبلا رفتیم.

پیشنهاد میشه شروع برنامه ساعت ۱۰ و پایان ساعت حدود ۱۲ تا ۱ باشه که در محل مبدا ناهار هم بخوریم.

یه رستوران Subway فقط دو دقیقه ای اینجا هست که میشه ناهار رو تهیه و در محل  بصورت پیک نیکی خورد و یا از خونه برد.

لطفا در صورتی که تمایل به شرکت دارین، این پیام رو لایک کنین تا بدونیم منتظر چه عزیزانی باشیم.`;

it("titles", { timeout: 300_000 }, async () => {
  const client = new GroqClient((env as unknown as { GROQ_API_KEY: string }).GROQ_API_KEY);
  const model = GROQ_MODELS[0];
  const out: string[] = [];
  for (const [label, text] of [["cycling", CYCLING], ["yoga", "Yoga every Tuesday at 6pm"], ["catch-up", "Let's catch up 19 Sep, 8pm at the usual cafe"]] as const) {
    for (let run = 1; run <= 3; run++) {
      const a = await client.call(model, { systemPrompt: eventExtractPrompt, responseSchema: EVENT_SCHEMA, userPrompt: text });
      out.push(a.result === "ok" ? `${label} #${run}: title=${JSON.stringify(JSON.parse(a.text).title)}` : `${label} #${run}: FAILED ${a.failure.kind} ${a.failure.httpStatus}`);
      await sleep(20_000);
    }
  }
  throw new Error("RESULTS\n" + out.join("\n"));
});
