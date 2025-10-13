import { SmrtCollection } from "@have/smrt";
import { ProfileMetadata } from "./index5.js";
class ProfileMetadataCollection extends SmrtCollection {
  static _itemClass = ProfileMetadata;
  /**
   * Get all metadata for a profile
   *
   * @param profileId - The profile UUID
   * @returns Array of ProfileMetadata instances
   */
  async getByProfile(profileId) {
    return await this.list({ where: { profileId } });
  }
  /**
   * Get metadata as key-value object for a profile
   *
   * @param profileId - The profile UUID
   * @returns Object with metafield slugs as keys
   */
  async getMetadataObject(profileId) {
    const metadata = await this.getByProfile(profileId);
    const result = {};
    for (const item of metadata) {
      const slug = await item.getMetafieldSlug();
      if (slug) {
        result[slug] = item.value;
      }
    }
    return result;
  }
  /**
   * Find all profiles with a specific metadata key-value pair
   *
   * @param metafieldId - The metafield UUID
   * @param value - The value to match
   * @returns Array of profile UUIDs
   */
  async findProfilesByMetadata(metafieldId, value) {
    const matches = await this.list({
      where: { metafieldId, value: String(value) }
    });
    return matches.map((m) => m.profileId);
  }
}
export {
  ProfileMetadataCollection
};
//# sourceMappingURL=index12.js.map
