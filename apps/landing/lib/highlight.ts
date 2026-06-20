/**
 * Tiny dependency-free TypeScript tokenizer for the code block.
 *
 * Not a full parser — just enough lexical classification to colour our own,
 * controlled snippets. Keeps first-load JS light (no Prism/Shiki).
 */

export type TokenType =
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "function"
  | "type"
  | "property"
  | "punctuation"
  | "plain";

export interface Token {
  text: string;
  type: TokenType;
}

const KEYWORDS = new Set([
  "const", "let", "var", "function", "async", "await", "return", "import",
  "from", "export", "default", "new", "if", "else", "for", "while", "of", "in",
  "type", "interface", "class", "extends", "implements", "public", "private",
  "readonly", "true", "false", "null", "undefined", "void", "as", "typeof",
  "this", "yield", "try", "catch", "finally", "throw", "switch", "case", "break",
]);

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;

/** Classify a bare identifier given a little surrounding context. */
function classifyIdentifier(
  word: string,
  prevSignificant: string,
  nextSignificant: string,
): TokenType {
  if (KEYWORDS.has(word)) return "keyword";
  if (prevSignificant === ".") return "property";
  if (nextSignificant === "(") return "function";
  if (/^[A-Z]/.test(word)) return "type";
  return "plain";
}

export function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  const n = code.length;
  let i = 0;
  let prevSignificant = "";

  const peekNextSignificant = (from: number): string => {
    let j = from;
    while (j < n && /\s/.test(code[j]!)) j++;
    return j < n ? code[j]! : "";
  };

  while (i < n) {
    const ch = code[i]!;

    // Whitespace
    if (/\s/.test(ch)) {
      let j = i + 1;
      while (j < n && /\s/.test(code[j]!)) j++;
      tokens.push({ text: code.slice(i, j), type: "plain" });
      i = j;
      continue;
    }

    // Line + block comments
    if (ch === "/" && code[i + 1] === "/") {
      let j = i + 2;
      while (j < n && code[j] !== "\n") j++;
      tokens.push({ text: code.slice(i, j), type: "comment" });
      i = j;
      continue;
    }
    if (ch === "/" && code[i + 1] === "*") {
      let j = i + 2;
      while (j < n && !(code[j] === "*" && code[j + 1] === "/")) j++;
      j = Math.min(n, j + 2);
      tokens.push({ text: code.slice(i, j), type: "comment" });
      i = j;
      continue;
    }

    // Strings (single, double, template — no nested interpolation parsing)
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < n && code[j] !== ch) {
        if (code[j] === "\\") j++;
        j++;
      }
      j = Math.min(n, j + 1);
      tokens.push({ text: code.slice(i, j), type: "string" });
      prevSignificant = ch;
      i = j;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[0-9a-fA-FxX._]/.test(code[j]!)) j++;
      tokens.push({ text: code.slice(i, j), type: "number" });
      prevSignificant = code[j - 1]!;
      i = j;
      continue;
    }

    // Identifiers / keywords
    if (IDENT_START.test(ch)) {
      let j = i + 1;
      while (j < n && IDENT_PART.test(code[j]!)) j++;
      const word = code.slice(i, j);
      const next = peekNextSignificant(j);
      tokens.push({ text: word, type: classifyIdentifier(word, prevSignificant, next) });
      prevSignificant = word;
      i = j;
      continue;
    }

    // Punctuation / operators
    tokens.push({ text: ch, type: "punctuation" });
    prevSignificant = ch;
    i += 1;
  }

  return tokens;
}
