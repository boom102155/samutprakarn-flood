import { createHash } from "node:crypto";

export type WeatherAlertCategory = "rain" | "storm" | "heat" | "cold" | "other";

export interface TmdWeatherWarning {
  key: string;
  issueNo: string;
  title: string;
  headline: string;
  description: string;
  categories: WeatherAlertCategory[];
  startsAt: string | null;
  endsAt: string | null;
  sourceUrl: string;
}

function decodeXml(value: string) {
  return value
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tagValue(xml: string, tagName: string) {
  const match = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function parseTmdDate(value: string): string | null {
  const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, yearText, month, day, hour, minute, second = "0"] = match;
  const year = Number(yearText) > 2400 ? Number(yearText) - 543 : Number(yearText);
  return new Date(Date.UTC(year, Number(month) - 1, Number(day), Number(hour) - 7, Number(minute), Number(second))).toISOString();
}

function isSamutPrakanCovered(text: string) {
  if (/สมุทรปราการ|กรุงเทพมหานคร|ปริมณฑล/.test(text)) return true;
  return /ภาคตะวันออก/.test(text) && !/ภาคตะวันออกเฉียงเหนือ/.test(text);
}

function categoriesIn(text: string): WeatherAlertCategory[] {
  const categories: WeatherAlertCategory[] = [];
  if (/ฝน|น้ำท่วม|น้ำป่า/.test(text)) categories.push("rain");
  if (/พายุ|ฟ้าคะนอง|ลมกระโชก|ลูกเห็บ|คลื่นสูง/.test(text)) categories.push("storm");
  if (/อากาศร้อน|คลื่นความร้อน|ดัชนีความร้อน|heat index/i.test(text)) categories.push("heat");
  if (/อากาศหนาว|อากาศเย็น|มวลอากาศเย็น|อุณหภูมิลด/.test(text)) categories.push("cold");
  return categories.length ? [...new Set(categories)] : ["other"];
}

export function parseTmdWarnings(xml: string, now = Date.now()): TmdWeatherWarning[] {
  return [...xml.matchAll(/<Warning\b[^>]*>([\s\S]*?)<\/Warning>/gi)]
    .flatMap(([, warningXml]) => {
      const issueNo = tagValue(warningXml, "IssueNo");
      const title = tagValue(warningXml, "TitleThai") || "ประกาศเตือนสภาพอากาศ";
      const headline = tagValue(warningXml, "HeadlineThai");
      const description = tagValue(warningXml, "DescriptionThai");
      const combined = `${title} ${headline} ${description}`;
      if (!isSamutPrakanCovered(combined)) return [];

      const startsAt = parseTmdDate(tagValue(warningXml, "EffectStartDate"));
      const endsAt = parseTmdDate(tagValue(warningXml, "EffectEndDate"));
      if (startsAt && Date.parse(startsAt) > now + 6 * 60 * 60 * 1000) return [];
      if (endsAt && Date.parse(endsAt) < now) return [];

      const sourceUrl = tagValue(warningXml, "WebUrlThai");
      const key = createHash("sha256")
        .update([issueNo, startsAt ?? "", endsAt ?? "", title].join("|"))
        .digest("hex");

      return [{
        key,
        issueNo,
        title,
        headline,
        description,
        categories: categoriesIn(combined),
        startsAt,
        endsAt,
        sourceUrl,
      }];
    });
}

export function formatWeatherAlert(warning: TmdWeatherWarning) {
  const paragraphs = [
    `⚠️ ${warning.title}`,
    warning.headline,
    warning.description,
    warning.startsAt || warning.endsAt
      ? `ช่วงเวลาที่มีผล: ${warning.startsAt ? new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(warning.startsAt)) : "เริ่มแล้ว"}${warning.endsAt ? ` ถึง ${new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(warning.endsAt))}` : ""}`
      : "",
    warning.sourceUrl ? `ประกาศฉบับเต็ม: ${warning.sourceUrl}` : "แหล่งข้อมูล: กรมอุตุนิยมวิทยา",
    "ข้อความนี้ส่งตามพื้นที่สมุทรปราการที่คุณแชร์ไว้ หากไม่ต้องการรับต่อ พิมพ์ “หยุด”",
  ].filter(Boolean);
  return paragraphs.join("\n\n").slice(0, 4900);
}
