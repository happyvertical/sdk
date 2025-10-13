import { SmrtCollection } from "@have/smrt";
import { ProfileRelationship } from "./index6.js";
class ProfileRelationshipCollection extends SmrtCollection {
  static _itemClass = ProfileRelationship;
  /**
   * Get all relationships from a profile
   *
   * @param fromProfileId - The origin profile UUID
   * @param typeId - Optional filter by relationship type UUID
   * @returns Array of ProfileRelationship instances
   */
  async getFromProfile(fromProfileId, typeId) {
    const where = { fromProfileId };
    if (typeId) where.typeId = typeId;
    return await this.list({ where });
  }
  /**
   * Get all relationships to a profile
   *
   * @param toProfileId - The target profile UUID
   * @param typeId - Optional filter by relationship type UUID
   * @returns Array of ProfileRelationship instances
   */
  async getToProfile(toProfileId, typeId) {
    const where = { toProfileId };
    if (typeId) where.typeId = typeId;
    return await this.list({ where });
  }
  /**
   * Get all relationships for a profile (both directions)
   *
   * @param profileId - The profile UUID
   * @param typeId - Optional filter by relationship type UUID
   * @returns Array of ProfileRelationship instances
   */
  async getForProfile(profileId, typeId) {
    const fromRelationships = await this.getFromProfile(profileId, typeId);
    const toRelationships = await this.getToProfile(profileId, typeId);
    return [...fromRelationships, ...toRelationships];
  }
  /**
   * Check if a relationship exists between two profiles
   *
   * @param fromProfileId - The origin profile UUID
   * @param toProfileId - The target profile UUID
   * @param typeId - The relationship type UUID
   * @returns True if relationship exists
   */
  async exists(fromProfileId, toProfileId, typeId) {
    const matches = await this.list({
      where: { fromProfileId, toProfileId, typeId },
      limit: 1
    });
    return matches.length > 0;
  }
}
export {
  ProfileRelationshipCollection
};
//# sourceMappingURL=index13.js.map
