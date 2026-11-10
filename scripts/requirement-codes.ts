/**
 * The old requirement-code notation: two to four capital letters, a dash, two digits and an
 * optional lower-case letter, or a family wildcard (letters, a dash and a star). Requirements
 * are named by their titles instead. Encoding names such as UTF-16 are not codes.
 */
export const REQUIREMENT_CODE =
  /(?<![\w-])(?!UTF-)[A-Z]{2,4}-(?:[0-9]{2}[a-z]?|\*)(?![\w-])/;

/** Each line of `text` that holds a code, as "line: text". */
export function linesWithCodes(text: string): string[] {
  const found: string[] = [];
  text.split("\n").forEach((line, index) => {
    if (REQUIREMENT_CODE.test(line)) found.push(`${index + 1}: ${line.trim()}`);
  });
  return found;
}
