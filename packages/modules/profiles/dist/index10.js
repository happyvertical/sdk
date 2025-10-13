import { SmrtCollection } from "@have/smrt";
import { ProfileType } from "./index3.js";
class ProfileTypeCollection extends SmrtCollection {
  static _itemClass = ProfileType;
  /**
   * Get profile type by slug
   *
   * @param slug - The slug to search for
   * @returns ProfileType instance or null
   */
  async getBySlug(slug) {
    return await this.get({ slug });
  }
  /**
   * Get or create a profile type by slug
   *
   * @param slug - The slug to search for
   * @param defaults - Default values if creating
   * @returns ProfileType instance
   */
  async getOrCreateBySlug(slug, defaults) {
    const existing = await this.getBySlug(slug);
    if (existing) return existing;
    const profileType = await this.create({ slug, ...defaults });
    await profileType.save();
    return profileType;
  }
}
export {
  ProfileTypeCollection
};
//# sourceMappingURL=index10.js.map
