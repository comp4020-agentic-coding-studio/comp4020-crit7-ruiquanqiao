// Turns P&C's requisite prose into a tree, or refuses to.
//
// The rule this file exists to keep: when the prose is ambiguous, say so. A
// sentence like "A or B OR (C) and (D)" has two readings, and picking one
// would tell a student they can enrol when they can't (or the reverse). Mixed
// AND/OR at one level with no brackets, two conditions with no operator
// between them, or a dangling operator all come back as "ambiguous" with a
// reason, and a person settles them in data/requisite-overrides.json.

export type Req =
  | { kind: "all"; of: Req[] }
  | { kind: "any"; of: Req[] }
  | { kind: "course"; code: string; concurrent: boolean }
  | { kind: "program"; program: string }
  | { kind: "units"; units: number; level: number; subject: string };

export type ParsedRequisite = {
  status: "parsed" | "ambiguous" | "none";
  tree: Req | null;
  reason: string | null;
  incompatible: string[];
  excludedPrograms: string[];
  caveat: boolean;
};

export const PROGRAMS: Record<string, string> = {
  MCOMP: "Master of Computing",
  VCOMP: "Master of Computing (Advanced)",
  MMLCV: "Master of Machine Learning and Computer Vision",
  GDCP: "Graduate Diploma of Computing",
  MENG: "Master of Engineering",
  MADAN: "Master of Applied Data Analytics",
  GDADA: "Graduate Diploma of Applied Data Analytics",
  GCADA: "Graduate Certificate of Applied Data Analytics",
  GCDE: "Graduate Certificate of Data Engineering",
  MCSSRM: "Master of Cyber Security, Strategy and Risk Management",
  MPM: "Master of Project Management",
  MBIS: "Master of Business Information Systems",
  GCNTR: "Graduate Certificate in Nuclear Technology and Regulation",
  MLLM: "Master of Laws",
  CLAW: "Graduate Certificate of Law",
  GCNTL: "Graduate Certificate of New Technologies Law",
  MJD: "Juris Doctor",
  MFIML: "Master of Financial Management and Law",
  MMGNT: "Master of Management",
  PG: "any ANU postgraduate program",
  STATS: "a listed statistics, actuarial or bioinformatics master's",
};

// Longest first: "Master of Computing (Advanced)" must win over "Master of
// Computing", and the MMLCV name swallows its own "and".
const PROGRAM_PATTERNS: [RegExp, string][] = [
  [/^Masters? of Computing\s*\(?Advanced\)?/i, "VCOMP"],
  [/^Masters? of Machine Learning and Computer Vision/i, "MMLCV"],
  [/^Masters? of Computing/i, "MCOMP"],
  [/^Graduate Diploma of Computing/i, "GDCP"],
  [/^Masters? of Engineering/i, "MENG"],
  [/^Masters? of Applied Data Analytics/i, "MADAN"],
  [/^Graduate Diploma of Applied Data Analytics/i, "GDADA"],
  [/^Graduate Certificate of Applied Data Analytics/i, "GCADA"],
  [/^Graduate Certificate of Data Engineering/i, "GCDE"],
  [/^Masters? of Cyber Security,? Strategy (?:&|and) Risk Management/i, "MCSSRM"],
  [/^Masters? of Management\b/i, "MMGNT"],
  [/^postgraduate program at ANU/i, "PG"],
  [/^(VCOMP|MCOMP|MMLCV|MADAN)\b/, "$1"],
];

const CAVEAT = /permission|case-by-case|GPA|equivalent|Additional Prerequisite|eligibility criteria|competitive entry|project group/i;
const CODE = /[A-Z]{4}\d{4}/g;

type Token =
  | { t: "leaf"; req: Req }
  | { t: "op"; op: "and" | "or" }
  | { t: "comma" }
  | { t: "semi" }
  | { t: "open" }
  | { t: "close" };

class Ambiguous extends Error {}

function tokenize(sentence: string): Token[] {
  const tokens: Token[] = [];
  let concurrent = false;
  let rest = sentence.replace(/\((VCOMP|MMLCV|MCOMP)\)/g, " ");

  const eat = (pattern: RegExp): RegExpMatchArray | null => {
    const match = rest.match(pattern);
    if (match) rest = rest.slice(match[0].length);
    return match;
  };

  while (rest.length > 0) {
    let match: RegExpMatchArray | null;
    if ((match = eat(/^\s+/))) continue;

    const program = PROGRAM_PATTERNS.find(([pattern]) => pattern.test(rest));
    if (program) {
      const found = eat(program[0]) as RegExpMatchArray;
      const code = program[1] === "$1" ? found[1] : program[1];
      tokens.push({ t: "leaf", req: { kind: "program", program: code } });
      continue;
    }
    if ((match = eat(/^(\d+) units of:? (\d)000-level ([A-Z]{4})(?: coded)? courses/i))) {
      tokens.push({
        t: "leaf",
        req: { kind: "units", units: Number(match[1]), level: Number(match[2]) * 1000, subject: match[3] },
      });
      continue;
    }
    if ((match = eat(/^\d+ units of:?(?: either)?/i))) continue;
    if (
      (match = eat(
        /^(?:have )?(?:successfully )?completed or (?:be |are )?(?:currently )?(?:studying|enrolled in)|^be (?:concurrently |currently )?enrolled in or have (?:successfully )?completed/i,
      ))
    ) {
      concurrent = true;
      continue;
    }
    if ((match = eat(/^completed\b/i))) {
      concurrent = false;
      continue;
    }
    if ((match = eat(/^([A-Z]{4})(\d{4})((?:\s*\/\s*\d{4})+)/))) {
      const alternatives = [match[2], ...(match[3].match(/\d{4}/g) ?? [])];
      tokens.push({ t: "open" });
      alternatives.forEach((digits, i) => {
        if (i > 0) tokens.push({ t: "op", op: "or" });
        tokens.push({ t: "leaf", req: { kind: "course", code: `${match?.[1]}${digits}`, concurrent } });
      });
      tokens.push({ t: "close" });
      continue;
    }
    if ((match = eat(/^[A-Z]{4}\d{4}/))) {
      tokens.push({ t: "leaf", req: { kind: "course", code: match[0], concurrent } });
      continue;
    }
    if ((match = eat(/^(?:and|&)(?![a-z])/i))) {
      tokens.push({ t: "op", op: "and" });
      continue;
    }
    if ((match = eat(/^or(?![a-z])/i))) {
      tokens.push({ t: "op", op: "or" });
      continue;
    }
    // "COMP2620 / COMP6262": a slash between two whole codes offers either
    if ((match = eat(/^\/(?=\s*[A-Z]{4}\d{4})/))) tokens.push({ t: "op", op: "or" });
    else if ((match = eat(/^;/))) tokens.push({ t: "semi" });
    else if ((match = eat(/^\(/))) tokens.push({ t: "open" });
    else if ((match = eat(/^\)/))) tokens.push({ t: "close" });
    else if ((match = eat(/^,/))) tokens.push({ t: "comma" });
    else eat(/^[^\s();,]+/) ?? eat(/^./);
  }
  return dropEmptyGroups(tokens);
}

// "(Special Topics in Computing page )" leaves an empty bracket pair behind
// once its words are dropped; it carries no condition.
function dropEmptyGroups(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (const token of tokens) {
    const last = out.at(-1);
    if (token.t === "close" && last?.t === "open") out.pop();
    else out.push(token);
  }
  return out;
}

function combine(operands: Req[], ops: ("and" | "or")[], where: string): Req {
  if (operands.length === 0) throw new Ambiguous(`no condition ${where}`);
  if (operands.length === 1) return operands[0];
  const distinct = new Set(ops);
  if (distinct.size > 1) throw new Ambiguous(`"and" and "or" mixed without brackets ${where}`);
  const kind = ops[0] === "and" ? "all" : "any";
  return { kind, of: operands.flatMap((o) => (o.kind === kind ? o.of : [o])) };
}

// One bracket level: operands separated by operators. Commas are list
// separators and take whatever operator the rest of the list uses.
function parseLevel(tokens: Token[], pos: { i: number }, depth: number): Req {
  const operands: Req[] = [];
  const ops: ("and" | "or")[] = [];
  let commas = 0;
  let expectOperand = true;

  while (pos.i < tokens.length) {
    const token = tokens[pos.i];
    if (token.t === "close") {
      if (depth === 0) throw new Ambiguous("a closing bracket with no opening one");
      break;
    }
    if (token.t === "semi") {
      if (depth === 0) break;
      throw new Ambiguous('a ";" inside brackets');
    }
    pos.i++;
    if (token.t === "comma") {
      if (!expectOperand) {
        commas++;
        expectOperand = true;
      }
      continue;
    }
    if (token.t === "op") {
      if (expectOperand) {
        // an operator with nothing before it means words were dropped: INFS8004
        // once read as "INFS7004" alone after "MMGNT - Master of Management
        // or" lost its program
        throw new Ambiguous(
          operands.length === 0 ? `an "${token.op}" with no condition before it` : `two operators in a row ("${token.op}")`,
        );
      }
      ops.push(token.op);
      expectOperand = true;
      continue;
    }
    if (!expectOperand) throw new Ambiguous("two conditions with no operator between them");
    if (token.t === "open") {
      operands.push(parseLevel(tokens, pos, depth + 1));
      if (tokens[pos.i]?.t !== "close") throw new Ambiguous("an unclosed bracket");
      pos.i++;
    } else {
      operands.push(token.req);
    }
    expectOperand = false;
  }
  if (expectOperand && operands.length > 0) throw new Ambiguous("a condition that trails off after an operator");
  if (commas > 0) {
    if (ops.length === 0) throw new Ambiguous("a comma-separated list with no operator");
    for (let n = 0; n < commas; n++) ops.push(ops[0]);
    if (new Set(ops).size > 1) throw new Ambiguous('a list whose commas could mean "and" or "or"');
  }
  return combine(operands, ops, depth === 0 ? "at the top level" : "inside brackets");
}

// ";" is the prose's strongest separator: "A or B; and C or D". The word after
// it says how the segments join.
function parseSentence(tokens: Token[]): Req | null {
  const pos = { i: 0 };
  const segments: Req[] = [];
  const joins: ("and" | "or")[] = [];
  for (;;) {
    const before = pos.i;
    const segment = tokens.slice(before).some((t) => t.t === "leaf") ? parseLevel(tokens, pos, 0) : null;
    if (segment) segments.push(segment);
    if (pos.i >= tokens.length || !segment) break;
    pos.i++; // the ";"
    const next = tokens[pos.i];
    if (next?.t !== "op") throw new Ambiguous('a ";" with no "and" or "or" after it');
    joins.push(next.op);
    pos.i++;
  }
  if (segments.length === 0) return null;
  return segments.length === 1 ? segments[0] : combine(segments, joins, 'across ";"');
}

function codesIn(text: string): string[] {
  return [...new Set(text.match(CODE) ?? [])];
}

export function parseRequisite(raw: string): ParsedRequisite {
  let text = ` ${raw.trim()} `;
  const incompatible: string[] = [];
  const excludedPrograms: string[] = [];

  const incompatibleClause = text.match(/Incompatible(?: with)?:?([\s\S]*?)(?=To enrol|$)/i);
  if (incompatibleClause) {
    incompatible.push(...codesIn(incompatibleClause[1]));
    text = text.replace(incompatibleClause[0], " ");
  }

  for (const clause of text.match(/(?:You are not able to|You cannot) enrol[^.]*/gi) ?? []) {
    incompatible.push(...codesIn(clause));
    const inProgram = clause.match(/enrolled in (?:the )?(.*)$/i)?.[1] ?? "";
    const program = PROGRAM_PATTERNS.find(([pattern]) => pattern.test(inProgram));
    if (program && !/completed/i.test(clause)) excludedPrograms.push(program[1]);
    text = text.replace(clause, " ");
  }

  const caveat = CAVEAT.test(raw);
  const requirements = text
    .split(/\.\s+(?=[A-Z])|\.\s*$/)
    // "must contact Student Services to request a permission code" is a
    // procedure, not a condition: COMP6340 once parsed as "enrolled in the
    // Master of Cyber Security" from exactly that sentence
    .filter((sentence) => /\bmust\b(?!\s+(?:contact|request|apply|submit)\b)/i.test(sentence));

  const base = {
    incompatible: [...new Set(incompatible)],
    excludedPrograms,
    caveat,
  };
  try {
    const trees = requirements.map((sentence) => {
      const tree = parseSentence(tokenize(sentence));
      // A "must" sentence that yields no condition is prose the tokenizer
      // can't read, not a sentence with nothing in it. Dropping it silently
      // is how STAT7039 once parsed as "STAT7055" alone.
      if (!tree && /enrolled|studying|completed/i.test(sentence)) {
        throw new Ambiguous("a requirement sentence no condition could be read from");
      }
      return tree;
    });
    const found = trees.filter((t): t is Req => t !== null);
    if (found.length === 0) return { ...base, status: "none", tree: null, reason: null };
    const tree = found.length === 1 ? found[0] : combine(found, found.slice(1).map(() => "and"), "across sentences");
    return { ...base, status: "parsed", tree, reason: null };
  } catch (error) {
    if (!(error instanceof Ambiguous)) throw error;
    return { ...base, status: "ambiguous", tree: null, reason: error.message };
  }
}

// The compact notation overrides are written in, and trees are printed in:
//   any(COMP6442*, COMP2100*)   * = may be taken in the same semester
//   all(@MCOMP, COMP6442)       @ = enrolled in a program
//   units(12, 6000, COMP)       units of <level>-level <subject> courses
export function formatReq(req: Req): string {
  switch (req.kind) {
    case "all":
    case "any":
      return `${req.kind}(${req.of.map(formatReq).join(", ")})`;
    case "course":
      return req.concurrent ? `${req.code}*` : req.code;
    case "program":
      return `@${req.program}`;
    case "units":
      return `units(${req.units}, ${req.level}, ${req.subject})`;
  }
}

export function readReq(source: string): Req {
  let i = 0;
  const skip = () => {
    while (/\s/.test(source[i] ?? "")) i++;
  };
  const expect = (char: string) => {
    skip();
    if (source[i] !== char) throw new Error(`expected "${char}" at ${i} in: ${source}`);
    i++;
  };
  const word = () => {
    skip();
    const match = source.slice(i).match(/^[@\w*]+/);
    if (!match) throw new Error(`unexpected "${source[i]}" at ${i} in: ${source}`);
    i += match[0].length;
    return match[0];
  };
  const node = (): Req => {
    const head = word();
    if (head === "all" || head === "any") {
      expect("(");
      const of: Req[] = [node()];
      skip();
      while (source[i] === ",") {
        i++;
        of.push(node());
        skip();
      }
      expect(")");
      return { kind: head, of };
    }
    if (head === "units") {
      expect("(");
      const units = Number(word());
      expect(",");
      const level = Number(word());
      expect(",");
      const subject = word();
      expect(")");
      return { kind: "units", units, level, subject };
    }
    if (head.startsWith("@")) return { kind: "program", program: head.slice(1) };
    if (/^[A-Z]{4}\d{4}\*?$/.test(head)) {
      return { kind: "course", code: head.replace("*", ""), concurrent: head.endsWith("*") };
    }
    throw new Error(`unknown term "${head}" in: ${source}`);
  };
  const tree = node();
  skip();
  if (i !== source.length) throw new Error(`trailing input at ${i} in: ${source}`);
  return tree;
}

export function codesInReq(req: Req): string[] {
  switch (req.kind) {
    case "all":
    case "any":
      return req.of.flatMap(codesInReq);
    case "course":
      return [req.code];
    default:
      return [];
  }
}

// The parser's own source, so the handbook tables are rebuilt whenever a rule
// here changes, not only when the data does (see the seed in catalog.ts).
export const PARSER_SOURCE = [tokenize, dropEmptyGroups, combine, parseLevel, parseSentence, parseRequisite, readReq]
  .map(String)
  .concat(PROGRAM_PATTERNS.map(([pattern, code]) => `${pattern}${code}`), String(CAVEAT))
  .join("\n");
