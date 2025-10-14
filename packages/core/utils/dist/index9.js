import { createHash } from "node:crypto";
function normalizeUrl(url) {
  const parsed = new URL(url);
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hostname = parsed.hostname.replace(/^www\./, "");
  if (parsed.protocol === "http:" && parsed.port === "80" || parsed.protocol === "https:" && parsed.port === "443") {
    parsed.port = "";
  }
  parsed.hash = "";
  const params = new URLSearchParams(parsed.search);
  const filtered = new URLSearchParams();
  const trackingParams = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "fbclid",
    "gclid",
    "msclkid",
    "_ga",
    "mc_cid",
    "mc_eid"
  ];
  Array.from(params.keys()).sort().forEach((key) => {
    if (!trackingParams.includes(key)) {
      filtered.set(key, params.get(key));
    }
  });
  parsed.search = filtered.toString();
  return parsed.toString();
}
function generateScopeFromUrl(url, baseScope = "discovery/parser") {
  const parsed = new URL(normalizeUrl(url));
  const domain = parsed.hostname;
  const pathParts = parsed.pathname.split("/").filter((p) => p);
  const pageType = pathParts[0] || "index";
  return `${baseScope}/${domain}/${pageType}`;
}
function hashPageContent(html) {
  return createHash("sha256").update(html).digest("hex");
}
export {
  generateScopeFromUrl,
  hashPageContent,
  normalizeUrl
};
//# sourceMappingURL=index9.js.map
