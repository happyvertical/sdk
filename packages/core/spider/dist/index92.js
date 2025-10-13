import require$$0 from "node:assert";
var subresourceIntegrity;
var hasRequiredSubresourceIntegrity;
function requireSubresourceIntegrity() {
  if (hasRequiredSubresourceIntegrity) return subresourceIntegrity;
  hasRequiredSubresourceIntegrity = 1;
  const assert = require$$0;
  const validSRIHashAlgorithmTokenSet = /* @__PURE__ */ new Map([["sha256", 0], ["sha384", 1], ["sha512", 2]]);
  let crypto;
  try {
    crypto = require("node:crypto");
    const cryptoHashes = crypto.getHashes();
    if (cryptoHashes.length === 0) {
      validSRIHashAlgorithmTokenSet.clear();
    }
    for (const algorithm of validSRIHashAlgorithmTokenSet.keys()) {
      if (cryptoHashes.includes(algorithm) === false) {
        validSRIHashAlgorithmTokenSet.delete(algorithm);
      }
    }
  } catch {
    validSRIHashAlgorithmTokenSet.clear();
  }
  const getSRIHashAlgorithmIndex = (
    /** @type {GetSRIHashAlgorithmIndex} */
    Map.prototype.get.bind(
      validSRIHashAlgorithmTokenSet
    )
  );
  const isValidSRIHashAlgorithm = (
    /** @type {IsValidSRIHashAlgorithm} */
    Map.prototype.has.bind(validSRIHashAlgorithmTokenSet)
  );
  const bytesMatch = crypto === void 0 || validSRIHashAlgorithmTokenSet.size === 0 ? () => true : (bytes, metadataList) => {
    const parsedMetadata = parseMetadata(metadataList);
    if (parsedMetadata.length === 0) {
      return true;
    }
    const metadata = getStrongestMetadata(parsedMetadata);
    for (const item of metadata) {
      const algorithm = item.alg;
      const expectedValue = item.val;
      const actualValue = applyAlgorithmToBytes(algorithm, bytes);
      if (caseSensitiveMatch(actualValue, expectedValue)) {
        return true;
      }
    }
    return false;
  };
  function getStrongestMetadata(metadataList) {
    const result = [];
    let strongest = null;
    for (const item of metadataList) {
      assert(isValidSRIHashAlgorithm(item.alg), "Invalid SRI hash algorithm token");
      if (result.length === 0) {
        result.push(item);
        strongest = item;
        continue;
      }
      const currentAlgorithm = (
        /** @type {Metadata} */
        strongest.alg
      );
      const currentAlgorithmIndex = getSRIHashAlgorithmIndex(currentAlgorithm);
      const newAlgorithm = item.alg;
      const newAlgorithmIndex = getSRIHashAlgorithmIndex(newAlgorithm);
      if (newAlgorithmIndex < currentAlgorithmIndex) {
        continue;
      } else if (newAlgorithmIndex > currentAlgorithmIndex) {
        strongest = item;
        result[0] = item;
        result.length = 1;
      } else {
        result.push(item);
      }
    }
    return result;
  }
  function parseMetadata(metadata) {
    const result = [];
    for (const item of metadata.split(" ")) {
      const expressionAndOptions = item.split("?", 1);
      const algorithmExpression = expressionAndOptions[0];
      let base64Value = "";
      const algorithmAndValue = [algorithmExpression.slice(0, 6), algorithmExpression.slice(7)];
      const algorithm = algorithmAndValue[0];
      if (!isValidSRIHashAlgorithm(algorithm)) {
        continue;
      }
      if (algorithmAndValue[1]) {
        base64Value = algorithmAndValue[1];
      }
      const metadata2 = {
        alg: algorithm,
        val: base64Value
      };
      result.push(metadata2);
    }
    return result;
  }
  const applyAlgorithmToBytes = (algorithm, bytes) => {
    return crypto.hash(algorithm, bytes, "base64");
  };
  function caseSensitiveMatch(actualValue, expectedValue) {
    let actualValueLength = actualValue.length;
    if (actualValueLength !== 0 && actualValue[actualValueLength - 1] === "=") {
      actualValueLength -= 1;
    }
    if (actualValueLength !== 0 && actualValue[actualValueLength - 1] === "=") {
      actualValueLength -= 1;
    }
    let expectedValueLength = expectedValue.length;
    if (expectedValueLength !== 0 && expectedValue[expectedValueLength - 1] === "=") {
      expectedValueLength -= 1;
    }
    if (expectedValueLength !== 0 && expectedValue[expectedValueLength - 1] === "=") {
      expectedValueLength -= 1;
    }
    if (actualValueLength !== expectedValueLength) {
      return false;
    }
    for (let i = 0; i < actualValueLength; ++i) {
      if (actualValue[i] === expectedValue[i] || actualValue[i] === "+" && expectedValue[i] === "-" || actualValue[i] === "/" && expectedValue[i] === "_") {
        continue;
      }
      return false;
    }
    return true;
  }
  subresourceIntegrity = {
    applyAlgorithmToBytes,
    bytesMatch,
    caseSensitiveMatch,
    isValidSRIHashAlgorithm,
    getStrongestMetadata,
    parseMetadata
  };
  return subresourceIntegrity;
}
export {
  requireSubresourceIntegrity as __require
};
//# sourceMappingURL=index92.js.map
