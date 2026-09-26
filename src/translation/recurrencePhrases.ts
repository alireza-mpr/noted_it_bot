import type { Weekday } from "../extractedEvents/extractedEvent";
import type { SupportedLanguage } from "./language";

// One phrase per plural form. "1" is used for exactly one ("every week" rather
// than "every 1 weeks"); any other number picks its Intl.PluralRules category
// for the language, falling back to `other`.
export type PluralForms = Partial<Record<"1" | Intl.LDMLPluralRule, string>> & { other: string };

export type Ordinal = "1" | "2" | "3" | "4" | "-1";

// A string, or one per grammatical gender of the weekday it goes with.
type Gendered = string | { m: string; f: string; n?: string };

// Everything needed to write "Repeats every 2 weeks on Monday and Wednesday,
// until 5 Jan 2027" in one language, without a model. Placeholders:
//   {n}       the interval (or count), in the language's digits
//   {days}    weekday names joined by Intl.ListFormat; for monthlyOnWeekday,
//             each one already wrapped in its `nth` phrase
//   {weekday} one weekday name (only inside `nth`)
//   {day}     the day of the month
//   {text}    the sentence so far (only inside `until` and `count`)
//   {date}    the end date, already formatted for the language
// Weekday names come from Intl, so a sentence has to read correctly with the
// plain (nominative) name. Where a language would inflect it, the templates
// put the names after a colon or in parentheses instead.
export interface RecurrencePhrases {
  daily: PluralForms;
  weekly: PluralForms;
  monthly: PluralForms;
  yearly: PluralForms;
  weeklyOn: PluralForms;
  monthlyOnDay: PluralForms;
  monthlyOnWeekday: PluralForms;
  nth: Record<Ordinal, Gendered>;
  // Weekdays that aren't masculine (or genderless), for picking `nth`.
  weekdayGender?: Partial<Record<Weekday, "f" | "n">>;
  // How {day} is written, when a bare number won't do ("22nd", "1er").
  monthDay?: (day: number) => string;
  until: string;
  count: PluralForms;
}

const EN_ORDINAL_SUFFIX: Partial<Record<Intl.LDMLPluralRule, string>> = { one: "st", two: "nd", few: "rd" };
const enOrdinals = new Intl.PluralRules("en", { type: "ordinal" });

export const RECURRENCE_PHRASES: Record<SupportedLanguage, RecurrencePhrases> = {
  en: {
    daily: { "1": "Repeats every day", other: "Repeats every {n} days" },
    weekly: { "1": "Repeats every week", other: "Repeats every {n} weeks" },
    monthly: { "1": "Repeats every month", other: "Repeats every {n} months" },
    yearly: { "1": "Repeats every year", other: "Repeats every {n} years" },
    weeklyOn: { "1": "Repeats every {days}", other: "Repeats every {n} weeks on {days}" },
    monthlyOnDay: { "1": "Repeats on the {day} of every month", other: "Repeats on the {day} of every {n} months" },
    monthlyOnWeekday: { "1": "Repeats on the {days} of every month", other: "Repeats on the {days} of every {n} months" },
    nth: { "1": "first {weekday}", "2": "second {weekday}", "3": "third {weekday}", "4": "fourth {weekday}", "-1": "last {weekday}" },
    monthDay: (day) => `${day}${EN_ORDINAL_SUFFIX[enOrdinals.select(day)] ?? "th"}`,
    until: "{text}, until {date}",
    count: { "1": "{text}, 1 time", other: "{text}, {n} times" },
  },
  fa: {
    daily: { "1": "هر روز تکرار می‌شود", other: "هر {n} روز یک‌بار تکرار می‌شود" },
    weekly: { "1": "هر هفته تکرار می‌شود", other: "هر {n} هفته یک‌بار تکرار می‌شود" },
    monthly: { "1": "هر ماه تکرار می‌شود", other: "هر {n} ماه یک‌بار تکرار می‌شود" },
    yearly: { "1": "هر سال تکرار می‌شود", other: "هر {n} سال یک‌بار تکرار می‌شود" },
    weeklyOn: { "1": "هر {days} تکرار می‌شود", other: "هر {n} هفته یک‌بار، {days} تکرار می‌شود" },
    monthlyOnDay: { "1": "روز {day} هر ماه تکرار می‌شود", other: "روز {day}، هر {n} ماه یک‌بار تکرار می‌شود" },
    monthlyOnWeekday: { "1": "{days} هر ماه تکرار می‌شود", other: "{days}، هر {n} ماه یک‌بار تکرار می‌شود" },
    nth: { "1": "اولین {weekday}", "2": "دومین {weekday}", "3": "سومین {weekday}", "4": "چهارمین {weekday}", "-1": "آخرین {weekday}" },
    until: "{text}، تا {date}",
    count: { other: "{text}، {n} بار" },
  },
  ar: {
    daily: { "1": "يتكرر كل يوم", two: "يتكرر كل يومين", few: "يتكرر كل {n} أيام", many: "يتكرر كل {n} يومًا", other: "يتكرر كل {n} يوم" },
    weekly: { "1": "يتكرر كل أسبوع", two: "يتكرر كل أسبوعين", few: "يتكرر كل {n} أسابيع", many: "يتكرر كل {n} أسبوعًا", other: "يتكرر كل {n} أسبوع" },
    monthly: { "1": "يتكرر كل شهر", two: "يتكرر كل شهرين", few: "يتكرر كل {n} أشهر", many: "يتكرر كل {n} شهرًا", other: "يتكرر كل {n} شهر" },
    yearly: { "1": "يتكرر كل سنة", two: "يتكرر كل سنتين", few: "يتكرر كل {n} سنوات", many: "يتكرر كل {n} سنة", other: "يتكرر كل {n} سنة" },
    weeklyOn: {
      "1": "يتكرر كل أسبوع يوم {days}",
      two: "يتكرر كل أسبوعين يوم {days}",
      few: "يتكرر كل {n} أسابيع يوم {days}",
      many: "يتكرر كل {n} أسبوعًا يوم {days}",
      other: "يتكرر كل {n} أسبوع يوم {days}",
    },
    monthlyOnDay: {
      "1": "يتكرر في اليوم {day} من كل شهر",
      two: "يتكرر في اليوم {day} من كل شهرين",
      few: "يتكرر في اليوم {day} من كل {n} أشهر",
      many: "يتكرر في اليوم {day} من كل {n} شهرًا",
      other: "يتكرر في اليوم {day} من كل {n} شهر",
    },
    monthlyOnWeekday: {
      "1": "يتكرر في {days} من كل شهر",
      two: "يتكرر في {days} من كل شهرين",
      few: "يتكرر في {days} من كل {n} أشهر",
      many: "يتكرر في {days} من كل {n} شهرًا",
      other: "يتكرر في {days} من كل {n} شهر",
    },
    nth: {
      "1": "يوم {weekday} الأول",
      "2": "يوم {weekday} الثاني",
      "3": "يوم {weekday} الثالث",
      "4": "يوم {weekday} الرابع",
      "-1": "يوم {weekday} الأخير",
    },
    until: "{text}، حتى {date}",
    count: { "1": "{text}، مرة واحدة", two: "{text}، مرتين", few: "{text}، {n} مرات", many: "{text}، {n} مرة", other: "{text}، {n} مرة" },
  },
  es: {
    daily: { "1": "Se repite cada día", other: "Se repite cada {n} días" },
    weekly: { "1": "Se repite cada semana", other: "Se repite cada {n} semanas" },
    monthly: { "1": "Se repite cada mes", other: "Se repite cada {n} meses" },
    yearly: { "1": "Se repite cada año", other: "Se repite cada {n} años" },
    weeklyOn: { "1": "Se repite cada {days}", other: "Se repite cada {n} semanas ({days})" },
    monthlyOnDay: { "1": "Se repite el día {day} de cada mes", other: "Se repite el día {day}, cada {n} meses" },
    monthlyOnWeekday: { "1": "Se repite el {days} de cada mes", other: "Se repite el {days}, cada {n} meses" },
    nth: { "1": "primer {weekday}", "2": "segundo {weekday}", "3": "tercer {weekday}", "4": "cuarto {weekday}", "-1": "último {weekday}" },
    until: "{text}, hasta el {date}",
    count: { "1": "{text}, 1 vez", other: "{text}, {n} veces" },
  },
  fr: {
    daily: { "1": "Se répète chaque jour", other: "Se répète tous les {n} jours" },
    weekly: { "1": "Se répète chaque semaine", other: "Se répète toutes les {n} semaines" },
    monthly: { "1": "Se répète chaque mois", other: "Se répète tous les {n} mois" },
    yearly: { "1": "Se répète chaque année", other: "Se répète tous les {n} ans" },
    weeklyOn: { "1": "Se répète chaque {days}", other: "Se répète toutes les {n} semaines, le {days}" },
    monthlyOnDay: { "1": "Se répète le {day} de chaque mois", other: "Se répète le {day}, tous les {n} mois" },
    monthlyOnWeekday: { "1": "Se répète le {days} de chaque mois", other: "Se répète le {days}, tous les {n} mois" },
    nth: { "1": "premier {weekday}", "2": "deuxième {weekday}", "3": "troisième {weekday}", "4": "quatrième {weekday}", "-1": "dernier {weekday}" },
    monthDay: (day) => (day === 1 ? "1er" : String(day)),
    until: "{text}, jusqu’au {date}",
    count: { "1": "{text}, 1 fois", other: "{text}, {n} fois" },
  },
  de: {
    daily: { "1": "Wiederholt sich jeden Tag", other: "Wiederholt sich alle {n} Tage" },
    weekly: { "1": "Wiederholt sich jede Woche", other: "Wiederholt sich alle {n} Wochen" },
    monthly: { "1": "Wiederholt sich jeden Monat", other: "Wiederholt sich alle {n} Monate" },
    yearly: { "1": "Wiederholt sich jedes Jahr", other: "Wiederholt sich alle {n} Jahre" },
    weeklyOn: { "1": "Wiederholt sich jeden {days}", other: "Wiederholt sich alle {n} Wochen am {days}" },
    monthlyOnDay: { "1": "Wiederholt sich am {day}. jedes Monats", other: "Wiederholt sich am {day}., alle {n} Monate" },
    monthlyOnWeekday: { "1": "Wiederholt sich am {days} jedes Monats", other: "Wiederholt sich am {days}, alle {n} Monate" },
    nth: { "1": "ersten {weekday}", "2": "zweiten {weekday}", "3": "dritten {weekday}", "4": "vierten {weekday}", "-1": "letzten {weekday}" },
    until: "{text}, bis {date}",
    count: { "1": "{text}, 1 Mal", other: "{text}, {n} Mal" },
  },
  it: {
    daily: { "1": "Si ripete ogni giorno", other: "Si ripete ogni {n} giorni" },
    weekly: { "1": "Si ripete ogni settimana", other: "Si ripete ogni {n} settimane" },
    monthly: { "1": "Si ripete ogni mese", other: "Si ripete ogni {n} mesi" },
    yearly: { "1": "Si ripete ogni anno", other: "Si ripete ogni {n} anni" },
    weeklyOn: { "1": "Si ripete ogni {days}", other: "Si ripete ogni {n} settimane ({days})" },
    monthlyOnDay: { "1": "Si ripete il giorno {day} di ogni mese", other: "Si ripete il giorno {day}, ogni {n} mesi" },
    monthlyOnWeekday: { "1": "Si ripete {days} di ogni mese", other: "Si ripete {days}, ogni {n} mesi" },
    nth: {
      "1": { m: "il primo {weekday}", f: "la prima {weekday}" },
      "2": { m: "il secondo {weekday}", f: "la seconda {weekday}" },
      "3": { m: "il terzo {weekday}", f: "la terza {weekday}" },
      "4": { m: "il quarto {weekday}", f: "la quarta {weekday}" },
      "-1": { m: "l’ultimo {weekday}", f: "l’ultima {weekday}" },
    },
    weekdayGender: { SU: "f" },
    until: "{text}, fino al {date}",
    count: { "1": "{text}, 1 volta", other: "{text}, {n} volte" },
  },
  pt: {
    daily: { "1": "Repete-se todos os dias", other: "Repete-se a cada {n} dias" },
    weekly: { "1": "Repete-se todas as semanas", other: "Repete-se a cada {n} semanas" },
    monthly: { "1": "Repete-se todos os meses", other: "Repete-se a cada {n} meses" },
    yearly: { "1": "Repete-se todos os anos", other: "Repete-se a cada {n} anos" },
    weeklyOn: { "1": "Repete-se todas as semanas ({days})", other: "Repete-se a cada {n} semanas ({days})" },
    monthlyOnDay: { "1": "Repete-se no dia {day} de cada mês", other: "Repete-se no dia {day}, a cada {n} meses" },
    monthlyOnWeekday: { "1": "Repete-se {days} de cada mês", other: "Repete-se {days}, a cada {n} meses" },
    nth: {
      "1": { m: "no primeiro {weekday}", f: "na primeira {weekday}" },
      "2": { m: "no segundo {weekday}", f: "na segunda {weekday}" },
      "3": { m: "no terceiro {weekday}", f: "na terceira {weekday}" },
      "4": { m: "no quarto {weekday}", f: "na quarta {weekday}" },
      "-1": { m: "no último {weekday}", f: "na última {weekday}" },
    },
    weekdayGender: { MO: "f", TU: "f", WE: "f", TH: "f", FR: "f" },
    until: "{text}, até {date}",
    count: { "1": "{text}, 1 vez", other: "{text}, {n} vezes" },
  },
  ru: {
    daily: { "1": "Повторяется каждый день", one: "Повторяется каждый {n} день", few: "Повторяется каждые {n} дня", other: "Повторяется каждые {n} дней" },
    weekly: { "1": "Повторяется каждую неделю", one: "Повторяется каждую {n} неделю", few: "Повторяется каждые {n} недели", other: "Повторяется каждые {n} недель" },
    monthly: { "1": "Повторяется каждый месяц", one: "Повторяется каждый {n} месяц", few: "Повторяется каждые {n} месяца", other: "Повторяется каждые {n} месяцев" },
    yearly: { "1": "Повторяется каждый год", one: "Повторяется каждый {n} год", few: "Повторяется каждые {n} года", other: "Повторяется каждые {n} лет" },
    weeklyOn: {
      "1": "Повторяется каждую неделю: {days}",
      one: "Повторяется каждую {n} неделю: {days}",
      few: "Повторяется каждые {n} недели: {days}",
      other: "Повторяется каждые {n} недель: {days}",
    },
    monthlyOnDay: {
      "1": "Повторяется {day}-го числа каждого месяца",
      one: "Повторяется {day}-го числа, каждый {n} месяц",
      few: "Повторяется {day}-го числа, каждые {n} месяца",
      other: "Повторяется {day}-го числа, каждые {n} месяцев",
    },
    monthlyOnWeekday: {
      "1": "Повторяется каждый месяц: {days}",
      one: "Повторяется каждый {n} месяц: {days}",
      few: "Повторяется каждые {n} месяца: {days}",
      other: "Повторяется каждые {n} месяцев: {days}",
    },
    nth: {
      "1": { m: "первый {weekday}", f: "первая {weekday}", n: "первое {weekday}" },
      "2": { m: "второй {weekday}", f: "вторая {weekday}", n: "второе {weekday}" },
      "3": { m: "третий {weekday}", f: "третья {weekday}", n: "третье {weekday}" },
      "4": { m: "четвёртый {weekday}", f: "четвёртая {weekday}", n: "четвёртое {weekday}" },
      "-1": { m: "последний {weekday}", f: "последняя {weekday}", n: "последнее {weekday}" },
    },
    weekdayGender: { WE: "f", FR: "f", SA: "f", SU: "n" },
    until: "{text}, до {date}",
    count: { "1": "{text}, 1 раз", one: "{text}, {n} раз", few: "{text}, {n} раза", other: "{text}, {n} раз" },
  },
  tr: {
    daily: { "1": "Her gün tekrarlanır", other: "{n} günde bir tekrarlanır" },
    weekly: { "1": "Her hafta tekrarlanır", other: "{n} haftada bir tekrarlanır" },
    monthly: { "1": "Her ay tekrarlanır", other: "{n} ayda bir tekrarlanır" },
    yearly: { "1": "Her yıl tekrarlanır", other: "{n} yılda bir tekrarlanır" },
    weeklyOn: { "1": "Her {days} tekrarlanır", other: "{n} haftada bir {days} günleri tekrarlanır" },
    monthlyOnDay: { "1": "Her ayın {day}. günü tekrarlanır", other: "{n} ayda bir, ayın {day}. günü tekrarlanır" },
    monthlyOnWeekday: { "1": "Her ayın {days} tekrarlanır", other: "{n} ayda bir, ayın {days} tekrarlanır" },
    nth: {
      "1": "ilk {weekday} günü",
      "2": "ikinci {weekday} günü",
      "3": "üçüncü {weekday} günü",
      "4": "dördüncü {weekday} günü",
      "-1": "son {weekday} günü",
    },
    until: "{text}, {date} tarihine kadar",
    count: { other: "{text}, {n} kez" },
  },
  zh: {
    daily: { "1": "每天重复", other: "每{n}天重复" },
    weekly: { "1": "每周重复", other: "每{n}周重复" },
    monthly: { "1": "每月重复", other: "每{n}个月重复" },
    yearly: { "1": "每年重复", other: "每{n}年重复" },
    weeklyOn: { "1": "每{days}重复", other: "每{n}周的{days}重复" },
    monthlyOnDay: { "1": "每月{day}日重复", other: "每{n}个月的{day}日重复" },
    monthlyOnWeekday: { "1": "每月的{days}重复", other: "每{n}个月的{days}重复" },
    nth: { "1": "第一个{weekday}", "2": "第二个{weekday}", "3": "第三个{weekday}", "4": "第四个{weekday}", "-1": "最后一个{weekday}" },
    until: "{text}，直到{date}",
    count: { other: "{text}，共{n}次" },
  },
  ja: {
    daily: { "1": "毎日繰り返し", other: "{n}日ごとに繰り返し" },
    weekly: { "1": "毎週繰り返し", other: "{n}週間ごとに繰り返し" },
    monthly: { "1": "毎月繰り返し", other: "{n}か月ごとに繰り返し" },
    yearly: { "1": "毎年繰り返し", other: "{n}年ごとに繰り返し" },
    weeklyOn: { "1": "毎週{days}に繰り返し", other: "{n}週間ごとの{days}に繰り返し" },
    monthlyOnDay: { "1": "毎月{day}日に繰り返し", other: "{n}か月ごとの{day}日に繰り返し" },
    monthlyOnWeekday: { "1": "毎月{days}に繰り返し", other: "{n}か月ごとの{days}に繰り返し" },
    nth: { "1": "第1{weekday}", "2": "第2{weekday}", "3": "第3{weekday}", "4": "第4{weekday}", "-1": "最終{weekday}" },
    until: "{text}（{date}まで）",
    count: { other: "{text}（{n}回）" },
  },
  ko: {
    daily: { "1": "매일 반복", other: "{n}일마다 반복" },
    weekly: { "1": "매주 반복", other: "{n}주마다 반복" },
    monthly: { "1": "매월 반복", other: "{n}개월마다 반복" },
    yearly: { "1": "매년 반복", other: "{n}년마다 반복" },
    weeklyOn: { "1": "매주 {days} 반복", other: "{n}주마다 {days} 반복" },
    monthlyOnDay: { "1": "매월 {day}일 반복", other: "{n}개월마다 {day}일 반복" },
    monthlyOnWeekday: { "1": "매월 {days} 반복", other: "{n}개월마다 {days} 반복" },
    nth: { "1": "첫 번째 {weekday}", "2": "두 번째 {weekday}", "3": "세 번째 {weekday}", "4": "네 번째 {weekday}", "-1": "마지막 {weekday}" },
    until: "{text}, {date}까지",
    count: { other: "{text}, {n}회" },
  },
  hi: {
    daily: { "1": "हर दिन दोहराया जाता है", other: "हर {n} दिन में दोहराया जाता है" },
    weekly: { "1": "हर सप्ताह दोहराया जाता है", other: "हर {n} सप्ताह में दोहराया जाता है" },
    monthly: { "1": "हर महीने दोहराया जाता है", other: "हर {n} महीने में दोहराया जाता है" },
    yearly: { "1": "हर साल दोहराया जाता है", other: "हर {n} साल में दोहराया जाता है" },
    weeklyOn: { "1": "हर {days} को दोहराया जाता है", other: "हर {n} सप्ताह में {days} को दोहराया जाता है" },
    monthlyOnDay: { "1": "हर महीने की {day} तारीख को दोहराया जाता है", other: "हर {n} महीने में {day} तारीख को दोहराया जाता है" },
    monthlyOnWeekday: { "1": "हर महीने के {days} को दोहराया जाता है", other: "हर {n} महीने में {days} को दोहराया जाता है" },
    nth: { "1": "पहले {weekday}", "2": "दूसरे {weekday}", "3": "तीसरे {weekday}", "4": "चौथे {weekday}", "-1": "आखिरी {weekday}" },
    until: "{text}, {date} तक",
    count: { "1": "{text}, 1 बार", other: "{text}, {n} बार" },
  },
  nl: {
    daily: { "1": "Herhaalt elke dag", other: "Herhaalt elke {n} dagen" },
    weekly: { "1": "Herhaalt elke week", other: "Herhaalt elke {n} weken" },
    monthly: { "1": "Herhaalt elke maand", other: "Herhaalt elke {n} maanden" },
    yearly: { "1": "Herhaalt elk jaar", other: "Herhaalt elke {n} jaar" },
    weeklyOn: { "1": "Herhaalt elke {days}", other: "Herhaalt elke {n} weken op {days}" },
    monthlyOnDay: { "1": "Herhaalt op de {day}e van elke maand", other: "Herhaalt op de {day}e, elke {n} maanden" },
    monthlyOnWeekday: { "1": "Herhaalt op de {days} van elke maand", other: "Herhaalt op de {days}, elke {n} maanden" },
    nth: { "1": "eerste {weekday}", "2": "tweede {weekday}", "3": "derde {weekday}", "4": "vierde {weekday}", "-1": "laatste {weekday}" },
    until: "{text}, tot {date}",
    count: { "1": "{text}, 1 keer", other: "{text}, {n} keer" },
  },
  pl: {
    daily: { "1": "Powtarza się codziennie", other: "Powtarza się co {n} dni" },
    weekly: { "1": "Powtarza się co tydzień", few: "Powtarza się co {n} tygodnie", other: "Powtarza się co {n} tygodni" },
    monthly: { "1": "Powtarza się co miesiąc", few: "Powtarza się co {n} miesiące", other: "Powtarza się co {n} miesięcy" },
    yearly: { "1": "Powtarza się co roku", few: "Powtarza się co {n} lata", other: "Powtarza się co {n} lat" },
    weeklyOn: {
      "1": "Powtarza się co tydzień: {days}",
      few: "Powtarza się co {n} tygodnie: {days}",
      other: "Powtarza się co {n} tygodni: {days}",
    },
    monthlyOnDay: {
      "1": "Powtarza się {day}. dnia każdego miesiąca",
      few: "Powtarza się {day}. dnia miesiąca, co {n} miesiące",
      other: "Powtarza się {day}. dnia miesiąca, co {n} miesięcy",
    },
    monthlyOnWeekday: {
      "1": "Powtarza się co miesiąc: {days}",
      few: "Powtarza się co {n} miesiące: {days}",
      other: "Powtarza się co {n} miesięcy: {days}",
    },
    nth: {
      "1": { m: "pierwszy {weekday}", f: "pierwsza {weekday}" },
      "2": { m: "drugi {weekday}", f: "druga {weekday}" },
      "3": { m: "trzeci {weekday}", f: "trzecia {weekday}" },
      "4": { m: "czwarty {weekday}", f: "czwarta {weekday}" },
      "-1": { m: "ostatni {weekday}", f: "ostatnia {weekday}" },
    },
    weekdayGender: { WE: "f", SA: "f", SU: "f" },
    until: "{text}, do {date}",
    count: { "1": "{text}, 1 raz", other: "{text}, {n} razy" },
  },
};
