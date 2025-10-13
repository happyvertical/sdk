const LANGUAGE_NAMES = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  ar: "Arabic",
  hi: "Hindi",
  nl: "Dutch",
  pl: "Polish",
  tr: "Turkish",
  sv: "Swedish",
  da: "Danish",
  no: "Norwegian",
  fi: "Finnish",
  cs: "Czech",
  el: "Greek",
  he: "Hebrew",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian",
  ro: "Romanian",
  uk: "Ukrainian",
  bg: "Bulgarian",
  hr: "Croatian",
  sk: "Slovak",
  sl: "Slovenian",
  lt: "Lithuanian",
  lv: "Latvian",
  et: "Estonian",
  hu: "Hungarian",
  ca: "Catalan",
  gl: "Galician",
  eu: "Basque",
  fa: "Persian",
  ur: "Urdu",
  bn: "Bengali",
  ta: "Tamil",
  te: "Telugu",
  mr: "Marathi",
  ml: "Malayalam",
  kn: "Kannada",
  gu: "Gujarati",
  pa: "Punjabi",
  sw: "Swahili",
  ms: "Malay",
  tl: "Tagalog",
  af: "Afrikaans",
  sq: "Albanian",
  am: "Amharic",
  hy: "Armenian",
  az: "Azerbaijani",
  be: "Belarusian",
  bs: "Bosnian",
  my: "Burmese",
  ceb: "Cebuano",
  ny: "Chichewa",
  co: "Corsican",
  eo: "Esperanto",
  fy: "Frisian",
  ka: "Georgian",
  haw: "Hawaiian",
  hmn: "Hmong",
  is: "Icelandic",
  ig: "Igbo",
  ga: "Irish",
  jw: "Javanese",
  kk: "Kazakh",
  km: "Khmer",
  ku: "Kurdish",
  ky: "Kyrgyz",
  lo: "Lao",
  la: "Latin",
  lb: "Luxembourgish",
  mk: "Macedonian",
  mg: "Malagasy",
  mt: "Maltese",
  mi: "Maori",
  mn: "Mongolian",
  ne: "Nepali",
  ps: "Pashto",
  sm: "Samoan",
  gd: "Scots Gaelic",
  sr: "Serbian",
  st: "Sesotho",
  sn: "Shona",
  sd: "Sindhi",
  si: "Sinhala",
  so: "Somali",
  su: "Sundanese",
  tg: "Tajik",
  tt: "Tatar",
  tk: "Turkmen",
  ug: "Uyghur",
  uz: "Uzbek",
  cy: "Welsh",
  xh: "Xhosa",
  yi: "Yiddish",
  yo: "Yoruba",
  zu: "Zulu"
};
function isValidLanguageCode(code) {
  return code.length === 2 && /^[a-z]{2}$/.test(code);
}
function getLanguageName(code) {
  return LANGUAGE_NAMES[code] || code;
}
function normalizeConfidence(score) {
  if (score > 1 && score <= 100) {
    return score / 100;
  }
  return Math.max(0, Math.min(1, score));
}
function isValidText(text) {
  return typeof text === "string" && text.trim().length > 0;
}
function truncateText(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + "...";
}
export {
  LANGUAGE_NAMES,
  getLanguageName,
  isValidLanguageCode,
  isValidText,
  normalizeConfidence,
  truncateText
};
//# sourceMappingURL=index6.js.map
