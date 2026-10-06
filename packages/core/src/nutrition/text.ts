/** Strips one English plural suffix so "rotis", "glasses" and "berries" compare equal to their singular. */
export function singularize(token: string): string {
  if (token.length <= 3 || /\d/.test(token)) return token;
  if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (/(sses|shes|ches|xes|oes)$/.test(token)) return token.slice(0, -2);
  if (token.endsWith("s") && !/(ss|us)$/.test(token)) return token.slice(0, -1);
  return token;
}

/** Splits text into lowercase singular word and number tokens. Numbers are kept, so "2" and "4" stay distinct. */
export function tokenize(text: string): string[] {
  const plain = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return (plain.match(/\d+(?:\.\d+)?|[a-z]+/g) ?? []).map(singularize);
}

/** Canonical form of a food name or unit: tokens joined by single spaces. */
export function normalizeText(text: string): string {
  return tokenize(text).join(" ");
}
