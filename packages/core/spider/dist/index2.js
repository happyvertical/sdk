import { getScraper } from "./index5.js";
async function scrapeIndex(url, options) {
  const scraperOptions = options?.scraper || {
    scraper: "basic",
    spider: "simple"
  };
  const scraper = await getScraper(scraperOptions);
  return scraper.scrape(url, options?.scrape);
}
export {
  scrapeIndex
};
//# sourceMappingURL=index2.js.map
