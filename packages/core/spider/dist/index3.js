import { getScraper } from "./index5.js";
function extractWordPressDownloadUrl(url, html) {
  const isWpdmPage = url.includes("/download/") || html.includes("wpdmdl=") || html.includes("wpdm-download-link") || html.includes("wpdm_view_count");
  if (!isWpdmPage) {
    return null;
  }
  const wpdmLinkMatch = html.match(
    /href=["']([^"']*wpdmdl=\d+[^"']*)["']/i
  );
  if (wpdmLinkMatch) {
    let downloadUrl = wpdmLinkMatch[1];
    downloadUrl = downloadUrl.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    if (downloadUrl.startsWith("/")) {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}${downloadUrl}`;
    }
    return downloadUrl;
  }
  const pdfLinkMatch = html.match(
    /href=["']([^"']*\.pdf[^"']*)["']/i
  );
  if (pdfLinkMatch) {
    let pdfUrl = pdfLinkMatch[1];
    pdfUrl = pdfUrl.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    if (pdfUrl.startsWith("/")) {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}${pdfUrl}`;
    }
    return pdfUrl;
  }
  return null;
}
function extractCivicWebDocumentUrl(url, html) {
  const isCivicWebPreview = url.includes("/filepro/documents/?preview=") || url.includes("civicweb.net") && url.includes("/filepro/documents");
  if (!isCivicWebPreview) {
    return null;
  }
  const previewMatch = url.match(/\?preview=(\d+)/);
  if (!previewMatch) return null;
  previewMatch[1];
  const docLinkMatch = html.match(
    /href=["'](\/filepro\/document\/\d+\/[^"']+\.pdf)["']/i
  );
  if (docLinkMatch) {
    let docUrl = docLinkMatch[1];
    docUrl = docUrl.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}${docUrl}`;
  }
  return null;
}
function extractDocuShareDocumentUrl(url, html) {
  const isDocuSharePage = url.includes("/docushare/dsweb/") || url.includes("DocuShare") || html.includes("DocuShare") || html.includes("/dsweb/Get/") || html.includes("/dsweb/ServicesLib/");
  if (!isDocuSharePage) {
    return null;
  }
  const getMatch = html.match(
    /href=["'](\/dsweb\/Get\/Document-\d+\/[^"']+\.(pdf|doc|docx|xls|xlsx|ppt|pptx))["']/i
  );
  if (getMatch) {
    let docUrl = getMatch[1];
    docUrl = docUrl.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}${docUrl}`;
  }
  const servicesMatch = html.match(
    /href=["'](\/dsweb\/ServicesLib\/Document-\d+\/[^"']+\.(pdf|doc|docx|xls|xlsx|ppt|pptx))["']/i
  );
  if (servicesMatch) {
    let docUrl = servicesMatch[1];
    docUrl = docUrl.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}${docUrl}`;
  }
  const directMatch = html.match(
    /href=["'](\/[^"']*(?:docushare|dsweb)[^"']+\.(pdf|doc|docx|xls|xlsx|ppt|pptx))["']/i
  );
  if (directMatch) {
    let docUrl = directMatch[1];
    docUrl = docUrl.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}${docUrl}`;
  }
  return null;
}
async function scrapeDocument(url, options) {
  const scraperType = options?.scraper || "basic";
  const spiderType = options?.spider || "dom";
  const scraper = await getScraper({
    scraper: scraperType,
    spider: spiderType
  });
  let result = await scraper.scrape(url, options);
  let actualUrl = url;
  const wpDownloadUrl = extractWordPressDownloadUrl(url, result.content);
  if (wpDownloadUrl) {
    return {
      url: wpDownloadUrl,
      type: "application/pdf",
      text: "",
      html: void 0,
      metadata: {
        title: void 0,
        description: void 0,
        isPdf: true,
        complete: false,
        // Indicate PDF needs separate processing
        strategy: "wordpress-pdf-link"
      }
    };
  }
  const civicWebUrl = extractCivicWebDocumentUrl(url, result.content);
  if (civicWebUrl) {
    return {
      url: civicWebUrl,
      type: "application/pdf",
      text: "",
      html: void 0,
      metadata: {
        title: void 0,
        description: void 0,
        isPdf: true,
        complete: false,
        // Indicate PDF needs separate processing
        strategy: "civicweb-pdf-link"
      }
    };
  }
  const docuShareUrl = extractDocuShareDocumentUrl(url, result.content);
  if (docuShareUrl) {
    const isPdf2 = docuShareUrl.toLowerCase().endsWith(".pdf");
    const docType = isPdf2 ? "application/pdf" : "application/octet-stream";
    return {
      url: docuShareUrl,
      type: docType,
      text: "",
      html: void 0,
      metadata: {
        title: void 0,
        description: void 0,
        isPdf: isPdf2,
        complete: false,
        // Indicate document needs separate processing
        strategy: "docushare-doc-link"
      }
    };
  }
  const isPdf = url.toLowerCase().endsWith(".pdf") || result.content.includes("application/pdf") || result.content.includes("%PDF-");
  let title;
  let description;
  if (!isPdf && result.content) {
    const titleMatch = result.content.match(
      /<title[^>]*>([^<]+)<\/title>/i
    );
    if (titleMatch) {
      title = titleMatch[1].trim();
    }
    const descMatch = result.content.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
    );
    if (descMatch) {
      description = descMatch[1].trim();
    }
  }
  let text = result.content;
  if (!isPdf) {
    text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
    text = text.replace(/<[^>]+>/g, " ");
    text = text.replace(/\s+/g, " ").trim();
  }
  return {
    url: actualUrl,
    // Use the actual download URL if redirected from WordPress
    type: isPdf ? "application/pdf" : "text/html",
    text,
    html: !isPdf ? result.content : void 0,
    metadata: {
      title,
      description,
      isPdf,
      complete: result.metrics.complete,
      strategy: result.strategy.type
    }
  };
}
async function findDocumentLinks(url, options) {
  const extensions = options?.extensions || [
    ".pdf",
    ".doc",
    ".docx",
    ".txt",
    ".md",
    ".rtf"
  ];
  const scraper = await getScraper({
    scraper: "basic",
    spider: "simple"
  });
  const result = await scraper.scrape(url);
  const documentLinks = result.links.filter((link) => {
    const href = link.href.toLowerCase();
    return extensions.some((ext) => href.endsWith(ext));
  }).map((link) => link.href);
  return [...new Set(documentLinks)];
}
export {
  findDocumentLinks,
  scrapeDocument
};
//# sourceMappingURL=index3.js.map
