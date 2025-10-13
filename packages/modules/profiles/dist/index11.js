import { SmrtCollection } from "@have/smrt";
import { ProfileMetafield } from "./index4.js";
class ProfileMetafieldCollection extends SmrtCollection {
  static _itemClass = ProfileMetafield;
  /**
   * Get metafield by slug
   *
   * @param slug - The slug to search for
   * @returns ProfileMetafield instance or null
   */
  async getBySlug(slug) {
    return await this.get({ slug });
  }
  /**
   * Get or create a metafield by slug
   *
   * @param slug - The slug to search for
   * @param defaults - Default values if creating
   * @returns ProfileMetafield instance
   */
  async getOrCreateBySlug(slug, defaults) {
    const existing = await this.getBySlug(slug);
    if (existing) return existing;
    const metafield = await this.create({ slug, ...defaults });
    await metafield.save();
    return metafield;
  }
}
export {
  ProfileMetafieldCollection
};
//# sourceMappingURL=index11.js.map
