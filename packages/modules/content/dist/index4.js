import yaml from "yaml";
function contentToString(content) {
  const { body, ...frontmatter } = content;
  const separator = "---";
  const frontmatterYAML = yaml.stringify(frontmatter);
  return `${separator}
${frontmatterYAML}
${separator}
${body}`;
}
function stringToContent(data) {
  const separator = "---";
  const frontmatterStart = data.indexOf(separator);
  let frontmatter = {};
  let body = data;
  if (frontmatterStart !== -1) {
    const frontmatterEnd = data.indexOf(
      separator,
      frontmatterStart + separator.length
    );
    if (frontmatterEnd !== -1) {
      const frontmatterYAML = data.substring(frontmatterStart + separator.length, frontmatterEnd).trim();
      frontmatter = yaml.parse(frontmatterYAML) || {};
      body = data.substring(frontmatterEnd + separator.length).trim();
    }
  }
  return {
    ...frontmatter,
    body
  };
}
export {
  contentToString,
  stringToContent
};
//# sourceMappingURL=index4.js.map
