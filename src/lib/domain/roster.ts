/**
 * Students are stored as a first name plus at most three letters of a surname, and the
 * full surname is never kept. That means collisions cannot be resolved from data we
 * hold, so an import that produces two identical names asks the teacher to fix them.
 */

export const MAX_SURNAME_LETTERS = 3;

/** "Maya Chen" with 2 letters becomes "Maya Ch". A lone first name stays as it is. */
export function toDisplayName(raw: string, letters = 1): string {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0];
  if (parts.length === 1) return first;
  const surname = parts[parts.length - 1];
  const keep = Math.min(Math.max(letters, 1), MAX_SURNAME_LETTERS);
  return `${first} ${surname.slice(0, keep)}`;
}

/** Pasted names: one per line, or comma separated, or both at once. */
export function parsePastedRoster(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => toDisplayName(name));
}

/** Splits one CSV line, honouring quotes so "Chen, Maya" survives as a single cell. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted && char === '"' && line[i + 1] === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else cell += char;
  }
  cells.push(cell);
  return cells.map((value) => value.trim());
}

/**
 * Takes the column headed "name" if there is one, otherwise the first column. A cell
 * written "Chen, Maya" is flipped back to first-name-first.
 */
export function parseCsvRoster(text: string): string[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const header = splitCsvLine(lines[0]);
  const nameColumn = header.findIndex((cell) => /name/i.test(cell));
  const column = nameColumn === -1 ? 0 : nameColumn;
  const rows = nameColumn === -1 ? lines : lines.slice(1);
  return rows
    .map((line) => splitCsvLine(line)[column] ?? "")
    .map((cell) => {
      const surnameFirst = cell.match(/^([^,]+),\s*(.+)$/);
      return surnameFirst ? `${surnameFirst[2]} ${surnameFirst[1]}` : cell;
    })
    .map((name) => toDisplayName(name))
    .filter(Boolean);
}

/** Every display name shared by more than one Student, with the positions holding it. */
export function findCollisions(
  names: string[],
): { name: string; indexes: number[] }[] {
  const seen = new Map<string, number[]>();
  names.forEach((name, index) => {
    const key = name.toLocaleLowerCase();
    seen.set(key, [...(seen.get(key) ?? []), index]);
  });
  return [...seen.entries()]
    .filter(([, indexes]) => indexes.length > 1)
    .map(([, indexes]) => ({ name: names[indexes[0]], indexes }));
}

/**
 * Which of the incoming names cannot be added as they stand — because they clash with a
 * Student already on the roster, or with each other.
 */
export function clashingIndexes(
  existing: string[],
  incoming: string[],
): number[] {
  const all = [...existing, ...incoming];
  const clashing = new Set<number>();
  for (const { indexes } of findCollisions(all)) {
    for (const index of indexes) {
      if (index >= existing.length) clashing.add(index - existing.length);
    }
  }
  return [...clashing].sort((a, b) => a - b);
}
