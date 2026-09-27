// Snapshot of Programs and Courses, one file per handbook year, into
// data/handbook/<year>.json. Run by hand (`pnpm scrape [years...]`); the build
// and the server never touch the network, so the app can't break because P&C
// is slow, down, or has changed its markup.
//
// Rules differ by year and apply by different years: a course is judged by the
// handbook of the year it is taken, a degree by the handbook of the year the
// student started. So every year a live plan can touch is kept, not just the
// latest.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const BASE = "https://programsandcourses.anu.edu.au";
const PROGRAM = "7706XMCOMP";
const DELAY_MS = 800;
const years = process.argv.slice(2).map(Number);
if (years.length === 0) years.push(2024, 2025, 2026, 2027);

type ListItem = { CourseCode: string; Name: string; Session: string; Career: string; Units: number };

export type ScrapedCourse = {
  code: string;
  name: string;
  units: number;
  career: string;
  sessions: string[];
  description: string;
  requisiteText: string;
};

export type ScrapedSpecialisation = {
  code: string;
  name: string;
  requirementText: string;
  courses: string[];
  missing?: boolean;
};

export type ScrapedProgram = {
  code: string;
  name: string;
  requirementText: string;
  specialisations: ScrapedSpecialisation[];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(path: string): Promise<string | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
      await sleep(DELAY_MS);
      if (res.status === 200) return await res.text();
      if (res.status === 301 || res.status === 302 || res.status === 404) return null;
    } catch {
      await sleep(DELAY_MS * attempt * 2);
    }
  }
  throw new Error(`${path}: failed three times`);
}

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
  return decode(
    html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(p|li|div|h\d)>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  )
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
  const found = raw.match(/(First|Second) Semester|(Summer|Autumn|Winter|Spring) Session/g) ?? [];
  return [...new Set(found.map((s) => SESSION_NAMES[s]))];
}

const codesIn = (html: string) => [...new Set([...html.matchAll(/\/course\/([A-Z]{4}\d{4})/g)].map((m) => m[1]))];

async function listCourses(year: number): Promise<ListItem[]> {
  const params = new URLSearchParams({
    AppliedFilter: "FilterByCourses",
    ShowAll: "true",
    PageIndex: "0",
    MaxPageSize: "10",
    PageSize: "Infinity",
    SearchText: "COMP",
    SelectedYear: String(year),
    CollegeName: "All Colleges",
    ModeOfDelivery: "All Modes",
  });
  const body = await get(`/data/CourseSearch/GetCourses?${params}`);
  if (!body) throw new Error(`${year}: no course list`);
  return (JSON.parse(body) as { Items: ListItem[] }).Items;
}

async function scrapeCourse(year: number, code: string, listed?: ListItem) {
  const html = await get(`/${year}/course/${code}`);
  if (!html) return null;
  const title = html.match(/intro__degree-title__component">([^<]*)</)?.[1];
  if (!title) return null;
  const units = Number(html.match(/Unit Value<\/span>\s*([\d.]+)\s*units/)?.[1] ?? listed?.Units ?? 6);
  const career = html.match(/Academic career<\/span>\s*<span[^>]*>([^<]*)</)?.[1]?.trim();
  const offeredIn = html.match(/Offered in<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "";
  const requisiteHtml = html.match(/<div class="requisite">([\s\S]*?)<\/div>/)?.[1] ?? "";
  const course: ScrapedCourse = {
    code,
    name: decode(title.trim()),
    units,
    career: listed?.Career ?? (career === "PGRD" ? "Postgraduate" : career === "UGRD" ? "Undergraduate" : (career ?? "")),
    sessions: parseSessions(listed ? listed.Session.split("/").join(" ") : offeredIn),
    description: toText(html.match(/<div class="introduction" id="introduction">([\s\S]*?)<\/div>/)?.[1] ?? ""),
    requisiteText: toText(requisiteHtml),
  };
  return { course, referenced: codesIn(requisiteHtml) };
}

function section(html: string, startId: string): string {
  const start = html.indexOf(`id="${startId}"`);
  if (start < 0) return "";
  const rest = html.slice(start);
  const end = rest.search(/<h2 id="(?!program-requirements)[^"]*"|<a class="back-to-top"/);
  return rest.slice(rest.indexOf(">") + 1, end > 0 ? end : undefined);
}

async function scrapeProgram(year: number): Promise<ScrapedProgram> {
  const html = await get(`/${year}/program/${PROGRAM}`);
  if (!html) throw new Error(`${year}: no ${PROGRAM} page`);
  const name = decode(html.match(/intro__degree-title__component">([^<]*)</)?.[1]?.trim() ?? "Master of Computing");
  const requirements = toText(section(html, "program-requirements"));
  // Links carry the year in some handbooks and not in others. The 2027 page
  // also links only six of the seven specialisations its requirements name,
  // so any known specialisation named in the text is tried as well.
  const linked = [...html.matchAll(/\/specialisation\/([A-Z]+-SPEC)/g)].map((m) => m[1]);
  const named = [...knownSpecialisations].filter(([, specName]) => requirements.includes(specName)).map(([code]) => code);
  const specialisations: ScrapedSpecialisation[] = [];
  for (const code of [...new Set([...linked, ...named])]) {
    const page = await get(`/${year}/specialisation/${code}`);
    if (!page) {
      // named by the program but unpublished this year: kept, with no rules,
      // rather than silently dropped or filled in from another year
      specialisations.push({ code, name: knownSpecialisations.get(code) ?? code, requirementText: "", courses: [], missing: true });
      continue;
    }
    const reqHtml = section(page, "requirements");
    const specName = decode(page.match(/intro__degree-title__component">([^<]*)</)?.[1]?.trim() ?? code);
    knownSpecialisations.set(code, specName.replace(/-/g, " "));
    specialisations.push({ code, name: specName, requirementText: toText(reqHtml), courses: codesIn(reqHtml) });
  }
  return { code: "MCOMP", name, requirementText: requirements, specialisations };
}

// Specialisation names seen in any handbook, including ones already on disk,
// so a single-year re-scrape still recognises them. Names are matched with
// hyphens as spaces: "Human-Centred" is "Human Centred" in the program text.
const knownSpecialisations = new Map<string, string>();
for (const file of existsSync("data/handbook") ? readdirSync("data/handbook") : []) {
  const handbook = JSON.parse(readFileSync(`data/handbook/${file}`, "utf8")) as { program: ScrapedProgram };
  for (const spec of handbook.program.specialisations) {
    if (!spec.missing) knownSpecialisations.set(spec.code, spec.name.replace(/-/g, " "));
  }
}

mkdirSync("data/handbook", { recursive: true });
for (const year of years) {
  const listed = (await listCourses(year)).filter((c) => c.Career === "Postgraduate" && c.CourseCode.startsWith("COMP"));
  const courses = new Map<string, ScrapedCourse>();
  const pending = new Set<string>();

  for (const item of listed) {
    const result = await scrapeCourse(year, item.CourseCode, item);
    if (!result) continue;
    courses.set(item.CourseCode, result.course);
    for (const code of result.referenced) pending.add(code);
  }

  const program = await scrapeProgram(year);
  for (const code of program.requirementText.match(/[A-Z]{4}\d{4}/g) ?? []) pending.add(code);
  for (const spec of program.specialisations) for (const code of spec.courses) pending.add(code);

  // Postgraduate courses the requisites, the program or a specialisation name
  // that the COMP list didn't include (MATH6005, STAT6039, ENGN courses in a
  // specialisation...), one hop out. Undergraduate codes stay bare.
  for (const code of pending) {
    if (courses.has(code) || Number(code[4]) < 6) continue;
    const result = await scrapeCourse(year, code);
    if (result) courses.set(code, result.course);
  }

  const sorted = [...courses.values()].sort((a, b) => a.code.localeCompare(b.code));
  writeFileSync(
    `data/handbook/${year}.json`,
    `${JSON.stringify({ source: BASE, year, scrapedAt: new Date().toISOString(), program, courses: sorted }, null, 2)}\n`,
  );
  console.log(
    `${year}: ${listed.length} listed PG COMP, ${sorted.length} courses kept, ${sorted.filter((c) => c.requisiteText).length} with requisite text, ${program.specialisations.length} specialisations`,
  );
}
