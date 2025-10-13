import { ValidationError } from "@have/utils";
async function getScraper(options) {
  if (!options || typeof options !== "object") {
    throw new ValidationError("Scraper options are required", { options });
  }
  if (!("scraper" in options)) {
    throw new ValidationError("Scraper type must be specified", { options });
  }
  switch (options.scraper) {
    case "basic": {
      const { BasicScraper } = await import("./index9.js");
      return new BasicScraper(options);
    }
    case "tree": {
      const { TreeScraper } = await import("./index10.js");
      return new TreeScraper(options);
    }
    // TODO: Implement additional scrapers
    case "ajax":
    case "scroll":
    case "pagination":
    default: {
      const unsupported = options.scraper;
      throw new ValidationError(
        `Unsupported scraper type: ${unsupported}. Only 'basic' and 'tree' are currently implemented.`,
        { options }
      );
    }
  }
}
export {
  getScraper
};
//# sourceMappingURL=index5.js.map
