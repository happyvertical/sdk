function isSimpleOptions(options) {
  return options.adapter === "simple";
}
function isDomOptions(options) {
  return options.adapter === "dom";
}
function isCrawleeOptions(options) {
  return options.adapter === "crawlee";
}
async function getSpider(options) {
  if (isSimpleOptions(options)) {
    const { SimpleAdapter } = await import("./index6.js");
    return new SimpleAdapter(options);
  }
  if (isDomOptions(options)) {
    const { DomAdapter } = await import("./index7.js");
    return new DomAdapter(options);
  }
  if (isCrawleeOptions(options)) {
    const { CrawleeAdapter } = await import("./index8.js");
    return new CrawleeAdapter(options);
  }
  throw new Error(`Unsupported adapter: ${options.adapter}`);
}
export {
  getSpider
};
//# sourceMappingURL=index4.js.map
