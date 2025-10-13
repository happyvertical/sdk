import { SmrtCollection } from "@have/smrt";
import { AssetStatus } from "./index3.js";
class AssetStatusCollection extends SmrtCollection {
  static _itemClass = AssetStatus;
  /**
   * Get or create an asset status by slug
   *
   * @param slug - The asset status slug
   * @param name - The display name (defaults to slug)
   * @param description - Optional description
   * @returns The existing or newly created AssetStatus
   */
  async getOrCreate(slug, name, description) {
    const existing = await this.list({ where: { slug }, limit: 1 });
    if (existing.length > 0) {
      return existing[0];
    }
    return await this.create({
      slug,
      name: name || slug,
      description
    });
  }
  /**
   * Initialize common asset statuses
   *
   * Creates standard asset statuses if they don't exist:
   * - draft
   * - published
   * - archived
   * - deleted
   */
  async initializeCommonStatuses() {
    await this.getOrCreate("draft", "Draft", "Work in progress, not yet ready");
    await this.getOrCreate("published", "Published", "Live and available");
    await this.getOrCreate(
      "archived",
      "Archived",
      "No longer active but preserved"
    );
    await this.getOrCreate("deleted", "Deleted", "Marked for deletion");
  }
}
export {
  AssetStatusCollection
};
//# sourceMappingURL=index7.js.map
