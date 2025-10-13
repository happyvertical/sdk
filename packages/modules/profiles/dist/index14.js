import { SmrtCollection } from "@have/smrt";
import { ProfileRelationshipType } from "./index7.js";
class ProfileRelationshipTypeCollection extends SmrtCollection {
  static _itemClass = ProfileRelationshipType;
  /**
   * Get relationship type by slug
   *
   * @param slug - The slug to search for
   * @returns ProfileRelationshipType instance or null
   */
  async getBySlug(slug) {
    return await this.get({ slug });
  }
  /**
   * Get or create a relationship type by slug
   *
   * @param slug - The slug to search for
   * @param defaults - Default values if creating
   * @returns ProfileRelationshipType instance
   */
  async getOrCreateBySlug(slug, defaults) {
    const existing = await this.getBySlug(slug);
    if (existing) return existing;
    const relationshipType = await this.create({ slug, ...defaults });
    await relationshipType.save();
    return relationshipType;
  }
  /**
   * Get all reciprocal relationship types
   *
   * @returns Array of reciprocal ProfileRelationshipType instances
   */
  async getReciprocal() {
    return await this.list({ where: { reciprocal: true } });
  }
  /**
   * Get all directional (non-reciprocal) relationship types
   *
   * @returns Array of directional ProfileRelationshipType instances
   */
  async getDirectional() {
    return await this.list({ where: { reciprocal: false } });
  }
}
export {
  ProfileRelationshipTypeCollection
};
//# sourceMappingURL=index14.js.map
