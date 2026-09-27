// One-off snapshot of Programs and Courses into data/catalog.json. Run by hand
// (`pnpm scrape`); the build and the server never touch the network, so the app
// can't break because P&C is slow, down, or has changed its markup.
import { writeFileSync } from "node:fs";

const BASE = "https://programsandcourses.anu.edu.au";
const YEAR = 2026;
const DELAY_MS = 1000;

type ListItem = {
  CourseCode: string;
  Name: string;
  Session: string;
  Career: string;
  Units: number;
};

type ScrapedCourse = {
  code: string;
  name: string;
  units: number;
  career: string;
  sessions: string[];
  description: string;
  requisiteText: string;
  referencedCodes: string[];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function decode(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&#8217;/g, "'")
    .replace(/&ndash;/g, "–");
}

function toText(html: string): string {
  return decode(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

const SESSION_NAMES: Record<string, string> = {
  "First Semester": "S1",
  "Second Semester": "S2",
  "Summer Session": "Summer",
  "Autumn Session": "Autumn",
  "Winter Session": "Winter",
  "Spring Session": "Spring",
};

function parseSessions(raw: string): string[] {
  return raw
    .split("/")
    .map((s) => SESSION_NAMES[s.trim()])
    .filter((s): s is string => Boolean(s));
}

async function listCourses(search: string): Promise<ListItem[]> {
  const params = new URLSearchParams({
    AppliedFilter: "FilterByCourses",
    ShowAll: "true",
    PageIndex: "0",
    MaxPageSize: "10",
    PageSize: "Infinity",
    SearchText: search,
    SelectedYear: String(YEAR),
    CollegeName: "All Colleges",
    ModeOfDelivery: "All Modes",
  });
  const res = await fetch(`${BASE}/data/CourseSearch/GetCourses?${params}`);
  if (!res.ok) throw new Error(`course list: HTTP ${res.status}`);
  const body = (await res.json()) as { Items: ListItem[] };
  return body.Items;
}

async function scrapeCourse(code: string, listed?: ListItem): Promise<ScrapedCourse | null> {
  const res = await fetch(`${BASE}/${YEAR}/course/${code}`);
  if (!res.ok) return null;
  const html = await res.text();

  const title = html.match(/intro__degree-title__component">([^<]*)</)?.[1];
  if (!title) return null;
  const units = Number(html.match(/Unit Value<\/span>\s*([\d.]+)\s*units/)?.[1] ?? listed?.Units ?? 6);
  const career = html.match(/Academic career<\/span>\s*<span[^>]*>([^<]*)</)?.[1]?.trim();
  const offeredIn = html.match(/Offered in<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "";
  const description = toText(html.match(/<div class="introduction" id="introduction">([\s\S]*?)<\/div>/)?.[1] ?? "");
  const requisiteHtml = html.match(/<div class="requisite">([\s\S]*?)<\/div>/)?.[1] ?? "";
  const referencedCodes = [...requisiteHtml.matchAll(/\/course\/([A-Z]{4}\d{4})/g)].map((m) => m[1]);

  const sessionsFromPage = [...offeredIn.matchAll(/(First|Second) Semester|(Summer|Autumn|Winter|Spring) Session/g)].map((m) =>
    m[0],
  );

  return {
    code,
    name: decode(title.trim()),
    units,
    career: listed?.Career ?? (career === "PGRD" ? "Postgraduate" : career === "UGRD" ? "Undergraduate" : (career ?? "")),
    sessions: listed ? parseSessions(listed.Session) : [...new Set(parseSessions(sessionsFromPage.join("/")))],
    description,
    requisiteText: toText(requisiteHtml),
    referencedCodes: [...new Set(referencedCodes)],
  };
}

const listed = (await listCourses("COMP")).filter((c) => c.Career === "Postgraduate" && c.CourseCode.startsWith("COMP"));
console.log(`list: ${listed.length} postgraduate COMP courses`);

const courses = new Map<string, ScrapedCourse>();
for (const item of listed) {
  const course = await scrapeCourse(item.CourseCode, item);
  if (course) courses.set(course.code, course);
  else console.warn(`  ${item.CourseCode}: no page`);
  await sleep(DELAY_MS);
}

// One more hop: postgraduate courses the requisites point at but the COMP list
// didn't include (MATH6005, STAT6039...). Undergraduate codes stay as stubs.
const pending = new Set<string>(["MATH6005"]);
for (const course of courses.values()) {
  for (const code of course.referencedCodes) {
    if (!courses.has(code) && Number(code.slice(4, 5)) >= 6) pending.add(code);
  }
}
for (const code of pending) {
  if (courses.has(code)) continue;
  const course = await scrapeCourse(code);
  if (course) courses.set(course.code, course);
  else console.warn(`  ${code}: no page`);
  await sleep(DELAY_MS);
}

const sorted = [...courses.values()].sort((a, b) => a.code.localeCompare(b.code));
writeFileSync(
  "data/catalog.json",
  `${JSON.stringify({ source: BASE, year: YEAR, scrapedAt: new Date().toISOString(), courses: sorted }, null, 2)}\n`,
);
console.log(
  `wrote data/catalog.json: ${sorted.length} courses, ${sorted.filter((c) => c.requisiteText).length} with requisite text`,
);
