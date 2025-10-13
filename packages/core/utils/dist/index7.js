import { createId as createId$1 } from "@paralleldrive/cuid2";
import { isCuid } from "@paralleldrive/cuid2";
import { isValid, add, format, parse, parseISO } from "date-fns";
import pluralize from "pluralize";
import { TimeoutError, ParsingError } from "./index6.js";
const makeId = (type = "cuid2") => {
  if (type === "cuid2") {
    return createId$1();
  }
  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
};
const createId = createId$1;
const makeSlug = (str) => {
  const from = "àáâäæãåāăąçćčđďèéêëēėęěğǵḧîïíīįìıİłḿñńǹňôöòóœøōõőṕŕřßśšşșťțûüùúūǘůűųẃẍÿýžźż+·/_,:;";
  const to = "aaaaaaaaaacccddeeeeeeeegghiiiiiiiilmnnnnoooooooooprrsssssttuuuuuuuuuwxyyzzz--------------";
  const textToCompare = new RegExp(
    from.split("").join("|").replace(/\+/g, "\\+"),
    "g"
  );
  return str.toString().toLowerCase().replace("&", "-38-").replace(/\s+/g, "-").replace(textToCompare, (c) => to.charAt(from.indexOf(c))).replace(/[&.]/g, "-").replace(/[^\w-º+]+/g, "").replace(/--+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
};
const urlFilename = (url) => {
  const parsedUrl = new URL(url);
  const pathSegments = parsedUrl.pathname.split("/");
  const filename = pathSegments[pathSegments.length - 1];
  return filename || "index.html";
};
const urlPath = (url) => {
  const parsedUrl = new URL(url);
  const pathSegments = [
    parsedUrl.hostname,
    ...parsedUrl.pathname.split("/").filter(Boolean)
  ];
  return pathSegments.join("/");
};
const sleep = (duration) => {
  return new Promise((resolve) => {
    setTimeout(resolve, duration);
  });
};
function waitFor(it, { timeout = 0, delay = 1e3 } = {}) {
  return new Promise((resolve, reject) => {
    const beginTime = Date.now();
    (async function waitATick() {
      try {
        const result = await it();
        if (typeof result !== "undefined") {
          return resolve(result);
        }
        if (timeout > 0) {
          if (Date.now() > beginTime + timeout) {
            return reject(
              new TimeoutError("Function call timed out", {
                timeout,
                delay,
                elapsedTime: Date.now() - beginTime
              })
            );
          }
        }
        setTimeout(waitATick, delay);
      } catch (error) {
        reject(error);
      }
    })();
  });
}
const isArray = (obj) => {
  return Array.isArray(obj);
};
const isPlainObject = (obj) => {
  return typeof obj === "object" && obj !== null && !Array.isArray(obj);
};
const isUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};
const camelCase = (str) => {
  return str.toLowerCase().replace(/[-_]+/g, " ").replace(/[^\w\s]/g, "").replace(/\s(.)/g, (_, char) => char.toUpperCase()).replace(/\s/g, "").replace(/^(.)/, (_, char) => char.toLowerCase());
};
const snakeCase = (str) => {
  return str.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "").replace(/[-\s]+/g, "_");
};
const keysToCamel = (obj) => {
  if (isPlainObject(obj)) {
    const n = {};
    Object.keys(obj).forEach((k) => {
      n[camelCase(k)] = keysToCamel(obj[k]);
    });
    return n;
  }
  if (isArray(obj)) {
    return obj.map((i) => keysToCamel(i));
  }
  return obj;
};
const keysToSnake = (obj) => {
  if (isPlainObject(obj)) {
    const n = {};
    Object.keys(obj).forEach((k) => {
      n[snakeCase(k)] = keysToSnake(obj[k]);
    });
    return n;
  }
  if (isArray(obj)) {
    return obj.map((i) => keysToSnake(i));
  }
  return obj;
};
const domainToCamel = (domain) => camelCase(domain);
const logTicker = (tick, options = {}) => {
  const { chars = [".", "..", "..."] } = options;
  if (tick) {
    const index = chars.indexOf(tick);
    return index + 1 >= chars.length ? chars[0] : chars[index + 1];
  }
  return chars[0];
};
const parseAmazonDateString = (dateStr) => {
  const regex = /^([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})([A-Z0-9]+)/;
  const match = dateStr.match(regex);
  if (!match) {
    throw new ParsingError("Could not parse Amazon date string", {
      dateString: dateStr,
      expectedFormat: "YYYYMMDDTHHMMSSZ"
    });
  }
  const [matched, year, month, day, hour, minutes, seconds, timezone] = match;
  if (matched !== dateStr) {
    throw new ParsingError("Invalid Amazon date string format", {
      dateString: dateStr,
      matched,
      expectedFormat: "YYYYMMDDTHHMMSSZ"
    });
  }
  const date = /* @__PURE__ */ new Date(
    `${year}-${month}-${day}T${hour}:${minutes}:${seconds}${timezone}`
  );
  return date;
};
const dateInString = (str) => {
  const cleanStr = str.toLowerCase();
  const underscoreMatch = str.match(/(\d{4})_(\d{1,2})_(\d{1,2})/);
  if (underscoreMatch) {
    const [, year2, month, day2] = underscoreMatch;
    const date2 = new Date(
      Number.parseInt(year2, 10),
      Number.parseInt(month, 10) - 1,
      Number.parseInt(day2, 10)
    );
    if (!Number.isNaN(date2.getTime())) return date2;
  }
  const dotMatch = str.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dotMatch) {
    const [, month, day2, year2] = dotMatch;
    const date2 = new Date(
      Number.parseInt(year2, 10),
      Number.parseInt(month, 10) - 1,
      Number.parseInt(day2, 10)
    );
    if (!Number.isNaN(date2.getTime())) return date2;
  }
  const isoMatch = cleanStr.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, year2, month, day2] = isoMatch;
    const date2 = new Date(
      Number.parseInt(year2, 10),
      Number.parseInt(month, 10) - 1,
      Number.parseInt(day2, 10)
    );
    if (!Number.isNaN(date2.getTime())) return date2;
  }
  const usMatch = cleanStr.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (usMatch) {
    const [, month, day2, year2] = usMatch;
    const date2 = new Date(
      Number.parseInt(year2, 10),
      Number.parseInt(month, 10) - 1,
      Number.parseInt(day2, 10)
    );
    if (!Number.isNaN(date2.getTime())) return date2;
  }
  const yearMatch = cleanStr.match(/20\d{2}/);
  if (!yearMatch) return null;
  const year = Number.parseInt(yearMatch[0], 10);
  const monthPatterns = {
    january: 1,
    jan: 1,
    february: 2,
    feb: 2,
    march: 3,
    mar: 3,
    april: 4,
    apr: 4,
    may: 5,
    june: 6,
    jun: 6,
    july: 7,
    jul: 7,
    august: 8,
    aug: 8,
    september: 9,
    sep: 9,
    sept: 9,
    october: 10,
    oct: 10,
    november: 11,
    nov: 11,
    december: 12,
    dec: 12
  };
  let foundMonth = null;
  let monthStart = -1;
  let monthName = "";
  for (const [name, monthNum] of Object.entries(monthPatterns)) {
    const monthIndex = cleanStr.indexOf(name);
    if (monthIndex !== -1) {
      foundMonth = monthNum;
      monthStart = monthIndex;
      monthName = name;
      break;
    }
  }
  if (!foundMonth) return null;
  const yearIndex = cleanStr.indexOf(yearMatch[0]);
  const beforeMonth = cleanStr.substring(
    Math.max(0, monthStart - 15),
    monthStart
  );
  const afterMonth = cleanStr.substring(
    monthStart + monthName.length,
    Math.min(cleanStr.length, monthStart + monthName.length + 15)
  );
  const beforeYear = cleanStr.substring(
    Math.max(0, yearIndex - 15),
    yearIndex
  );
  const afterYear = cleanStr.substring(
    yearIndex + 4,
    Math.min(cleanStr.length, yearIndex + 19)
  );
  const dayMatch = beforeMonth.match(/(?<!\d)(\d{1,2})\s*$/) || // Day before month (not preceded by another digit)
  afterMonth.match(/^\s*(\d{1,2})(?!\d)/) || // Day right after month (not followed by another digit)
  beforeYear.match(/(?<!\d)(\d{1,2})\s*$/) || // Day before year (not preceded by another digit)
  afterYear.match(/^\s*(\d{1,2})(?!\d)/) || // Day right after year (not followed by another digit)
  afterMonth.match(/[^\d](\d{1,2})(?!\d)/);
  const day = dayMatch ? Number.parseInt(dayMatch[1], 10) : 1;
  if (day < 1 || day > 31) return null;
  const date = new Date(year, foundMonth - 1, day);
  return !Number.isNaN(date.getTime()) ? date : null;
};
const prettyDate = (dateString) => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat(void 0, {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(date);
};
const pluralizeWord = pluralize;
const singularize = pluralize.singular;
const isPlural = pluralize.isPlural;
const isSingular = pluralize.isSingular;
const formatDate = (date, formatStr = "yyyy-MM-dd") => {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return format(dateObj, formatStr);
};
const parseDate = (dateStr, formatStr) => {
  if (formatStr) {
    return parse(dateStr, formatStr, /* @__PURE__ */ new Date());
  }
  return parseISO(dateStr);
};
const isValidDate = isValid;
const addInterval = add;
const getTempDirectory = (subfolder) => {
  const tmpBase = process?.env ? process.env.TMPDIR || process.env.TMP || process.env.TEMP || "/tmp" : "/tmp";
  const basePath = `${tmpBase}/.have-sdk`;
  return subfolder ? `${basePath}/${subfolder}` : basePath;
};
export {
  addInterval,
  camelCase,
  createId,
  dateInString,
  domainToCamel,
  formatDate,
  getTempDirectory,
  isArray,
  isCuid,
  isPlainObject,
  isPlural,
  isSingular,
  isUrl,
  isValidDate,
  keysToCamel,
  keysToSnake,
  logTicker,
  makeId,
  makeSlug,
  parseAmazonDateString,
  parseDate,
  pluralizeWord,
  prettyDate,
  singularize,
  sleep,
  snakeCase,
  urlFilename,
  urlPath,
  waitFor
};
//# sourceMappingURL=index7.js.map
