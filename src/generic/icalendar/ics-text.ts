// The longest line, in octets, that RFC 5545 §3.1 allows before folding.
const MAX_LINE_OCTETS = 75;

// Returns the text with the characters that RFC 5545 §3.3.11 gives a special
// meaning escaped: backslash, semicolon, comma and newline.
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// Returns the line folded into lines of at most 75 octets, as RFC 5545 §3.1
// asks. Each new line starts with CRLF and one space. A character is never
// split.
export function foldIcsLine(line: string): string {
  const lineBytes = new TextEncoder().encode(line);
  if (lineBytes.length <= MAX_LINE_OCTETS) {
    return line;
  }
  const decoder = new TextDecoder();
  const foldedParts: string[] = [];
  let partStart = 0;
  let partMaxOctets = MAX_LINE_OCTETS;
  while (partStart < lineBytes.length) {
    let partEnd = Math.min(partStart + partMaxOctets, lineBytes.length);
    // A UTF-8 byte that starts with the bits 10 is inside a character.
    while (
      partEnd > partStart &&
      partEnd < lineBytes.length &&
      (lineBytes[partEnd] & 0xc0) === 0x80
    ) {
      partEnd--;
    }
    foldedParts.push(decoder.decode(lineBytes.slice(partStart, partEnd)));
    partStart = partEnd;
    // Each new line needs one octet for its leading space.
    partMaxOctets = MAX_LINE_OCTETS - 1;
  }
  return foldedParts.join("\r\n ");
}
