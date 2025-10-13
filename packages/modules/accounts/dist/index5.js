import { SmrtCollection } from "@have/smrt";
import { Account } from "./index2.js";
class AccountCollection extends SmrtCollection {
  static _itemClass = Account;
  /**
   * Get accounts by type
   *
   * @param type - Account type (asset, liability, equity, revenue, expense)
   * @returns Array of Account instances
   */
  async getByType(type) {
    return await this.list({ where: { type } });
  }
  /**
   * Get accounts by currency
   *
   * @param currency - ISO 4217 currency code
   * @returns Array of Account instances
   */
  async getByCurrency(currency) {
    return await this.list({ where: { currency } });
  }
  /**
   * Get root accounts (accounts with no parent)
   *
   * @returns Array of root Account instances
   */
  async getRootAccounts() {
    const allAccounts = await this.list({});
    return allAccounts.filter((account) => !account.parentId);
  }
  /**
   * Get child accounts of a parent
   *
   * @param parentId - Parent account ID
   * @returns Array of child Account instances
   */
  async getChildren(parentId) {
    return await this.list({ where: { parentId } });
  }
  /**
   * Get all accounts of a specific type and currency
   *
   * @param type - Account type
   * @param currency - Currency code
   * @returns Array of Account instances
   */
  async getByTypeAndCurrency(type, currency) {
    return await this.list({ where: { type, currency } });
  }
  /**
   * Search accounts by name (case-insensitive partial match)
   *
   * @param searchTerm - Search term
   * @returns Array of matching Account instances
   */
  async searchByName(searchTerm) {
    const allAccounts = await this.list({});
    const lowerSearch = searchTerm.toLowerCase();
    return allAccounts.filter(
      (account) => account.name.toLowerCase().includes(lowerSearch)
    );
  }
  /**
   * Get account hierarchy tree structure
   * Returns root accounts with nested children
   *
   * @returns Array of root accounts with children property
   */
  async getHierarchyTree() {
    const allAccounts = await this.list({});
    const accountMap = /* @__PURE__ */ new Map();
    const roots = [];
    for (const account of allAccounts) {
      accountMap.set(account.id, { ...account, children: [] });
    }
    for (const account of allAccounts) {
      const node = accountMap.get(account.id);
      if (account.parentId && accountMap.has(account.parentId)) {
        accountMap.get(account.parentId)?.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }
}
export {
  AccountCollection
};
//# sourceMappingURL=index5.js.map
