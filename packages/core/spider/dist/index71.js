import { __require as requireConstants } from "./index70.js";
var tree_1;
var hasRequiredTree;
function requireTree() {
  if (hasRequiredTree) return tree_1;
  hasRequiredTree = 1;
  const {
    wellknownHeaderNames,
    headerNameLowerCasedRecord
  } = requireConstants();
  class TstNode {
    /** @type {any} */
    value = null;
    /** @type {null | TstNode} */
    left = null;
    /** @type {null | TstNode} */
    middle = null;
    /** @type {null | TstNode} */
    right = null;
    /** @type {number} */
    code;
    /**
     * @param {string} key
     * @param {any} value
     * @param {number} index
     */
    constructor(key, value, index) {
      if (index === void 0 || index >= key.length) {
        throw new TypeError("Unreachable");
      }
      const code = this.code = key.charCodeAt(index);
      if (code > 127) {
        throw new TypeError("key must be ascii string");
      }
      if (key.length !== ++index) {
        this.middle = new TstNode(key, value, index);
      } else {
        this.value = value;
      }
    }
    /**
     * @param {string} key
     * @param {any} value
     * @returns {void}
     */
    add(key, value) {
      const length = key.length;
      if (length === 0) {
        throw new TypeError("Unreachable");
      }
      let index = 0;
      let node = this;
      while (true) {
        const code = key.charCodeAt(index);
        if (code > 127) {
          throw new TypeError("key must be ascii string");
        }
        if (node.code === code) {
          if (length === ++index) {
            node.value = value;
            break;
          } else if (node.middle !== null) {
            node = node.middle;
          } else {
            node.middle = new TstNode(key, value, index);
            break;
          }
        } else if (node.code < code) {
          if (node.left !== null) {
            node = node.left;
          } else {
            node.left = new TstNode(key, value, index);
            break;
          }
        } else if (node.right !== null) {
          node = node.right;
        } else {
          node.right = new TstNode(key, value, index);
          break;
        }
      }
    }
    /**
     * @param {Uint8Array} key
     * @returns {TstNode | null}
     */
    search(key) {
      const keylength = key.length;
      let index = 0;
      let node = this;
      while (node !== null && index < keylength) {
        let code = key[index];
        if (code <= 90 && code >= 65) {
          code |= 32;
        }
        while (node !== null) {
          if (code === node.code) {
            if (keylength === ++index) {
              return node;
            }
            node = node.middle;
            break;
          }
          node = node.code < code ? node.left : node.right;
        }
      }
      return null;
    }
  }
  class TernarySearchTree {
    /** @type {TstNode | null} */
    node = null;
    /**
     * @param {string} key
     * @param {any} value
     * @returns {void}
     * */
    insert(key, value) {
      if (this.node === null) {
        this.node = new TstNode(key, value, 0);
      } else {
        this.node.add(key, value);
      }
    }
    /**
     * @param {Uint8Array} key
     * @returns {any}
     */
    lookup(key) {
      return this.node?.search(key)?.value ?? null;
    }
  }
  const tree = new TernarySearchTree();
  for (let i = 0; i < wellknownHeaderNames.length; ++i) {
    const key = headerNameLowerCasedRecord[wellknownHeaderNames[i]];
    tree.insert(key, key);
  }
  tree_1 = {
    TernarySearchTree,
    tree
  };
  return tree_1;
}
export {
  requireTree as __require
};
//# sourceMappingURL=index71.js.map
