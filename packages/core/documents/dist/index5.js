function getTitleFromUrl(url, defaultTitle = "Document") {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split("/").pop() || defaultTitle;
    const decodedFilename = decodeURIComponent(filename);
    return decodedFilename.replace(/\.(pdf|html?|md|txt)$/i, "").replace(/[-_]/g, " ").trim();
  } catch {
    return defaultTitle;
  }
}
export {
  getTitleFromUrl
};
//# sourceMappingURL=index5.js.map
