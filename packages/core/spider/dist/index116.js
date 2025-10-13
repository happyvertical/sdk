var constants;
var hasRequiredConstants;
function requireConstants() {
  if (hasRequiredConstants) return constants;
  hasRequiredConstants = 1;
  const maxAttributeValueSize = 1024;
  const maxNameValuePairSize = 4096;
  constants = {
    maxAttributeValueSize,
    maxNameValuePairSize
  };
  return constants;
}
export {
  requireConstants as __require
};
//# sourceMappingURL=index116.js.map
