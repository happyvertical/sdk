import { SmrtCollection } from "@have/smrt";
import { ProfileRelationshipTerm } from "./index8.js";
class ProfileRelationshipTermCollection extends SmrtCollection {
  static _itemClass = ProfileRelationshipTerm;
  /**
   * Get all terms for a relationship
   *
   * @param relationshipId - The relationship UUID
   * @returns Array of ProfileRelationshipTerm instances
   */
  async getByRelationship(relationshipId) {
    return await this.list({
      where: { relationshipId },
      orderBy: ["startedAt DESC"]
    });
  }
  /**
   * Get the active term for a relationship (no end date or future end date)
   *
   * @param relationshipId - The relationship UUID
   * @returns Active term or null
   */
  async getActiveTerm(relationshipId) {
    const terms = await this.getByRelationship(relationshipId);
    for (const term of terms) {
      if (term.isActive()) {
        return term;
      }
    }
    return null;
  }
  /**
   * Get all historical (ended) terms for a relationship
   *
   * @param relationshipId - The relationship UUID
   * @returns Array of ended ProfileRelationshipTerm instances
   */
  async getHistoricalTerms(relationshipId) {
    const terms = await this.getByRelationship(relationshipId);
    return terms.filter((term) => !term.isActive());
  }
}
export {
  ProfileRelationshipTermCollection
};
//# sourceMappingURL=index15.js.map
