const VARIANTS = ["dna", "molecule", "protein", "chromosome", "microscope"];

const KEYWORDS = [
  { variant: "dna", re: /(dna|днк|рнк|rna|ген|gene|нукле|nucle|репликац|транскрип)/i },
  { variant: "chromosome", re: /(хромат|хромосом|chromat|chromosom|barr|барр|кариотип|митоз|мейоз)/i },
  { variant: "protein", re: /(бел[оки]|protein|фермент|enzym|аминокисл|amino|трансляц)/i },
  { variant: "microscope", re: /(клетк|cell|микроскоп|microscop|гистолог|ткан|органелл|иммун|immun|лимфоцит|микроб|бактер)/i },
  { variant: "molecule", re: /(молекул|molecul|хими|chem|липид|углевод|метабол|биохим)/i }
];

/** Иллюстрация для карточки: по ключевым словам в названии, иначе по порядку. */
export function pickThumbVariant(title, index = 0) {
  const text = String(title || "");
  const match = KEYWORDS.find((k) => k.re.test(text));
  return match ? match.variant : VARIANTS[Math.abs(index) % VARIANTS.length];
}
