import { SmrtCollection } from "@have/smrt";
import { PlaceType } from "./index3.js";
class PlaceTypeCollection extends SmrtCollection {
  static _itemClass = PlaceType;
  /**
   * Get or create a place type by slug
   *
   * @param slug - PlaceType slug (e.g., 'city', 'building')
   * @param name - Optional display name (defaults to capitalized slug)
   * @returns PlaceType instance
   */
  async getOrCreate(slug, name) {
    const existing = await this.get({ slug });
    if (existing) {
      return existing;
    }
    const displayName = name || slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
    return await this.create({
      slug,
      name: displayName
    });
  }
  /**
   * Get a place type by slug
   *
   * @param slug - PlaceType slug to search for
   * @returns PlaceType instance or null if not found
   */
  async getBySlug(slug) {
    return await this.get({ slug });
  }
  /**
   * Initialize default place types
   *
   * Creates standard types if they don't exist:
   * - country
   * - region (state/province)
   * - city
   * - address
   * - building
   * - room
   * - zone (for abstract/virtual places)
   *
   * @returns Array of created/existing place types
   */
  async initializeDefaults() {
    const defaults = [
      { slug: "country", name: "Country" },
      { slug: "region", name: "Region" },
      { slug: "city", name: "City" },
      { slug: "address", name: "Address" },
      { slug: "building", name: "Building" },
      { slug: "room", name: "Room" },
      { slug: "zone", name: "Zone" },
      { slug: "point_of_interest", name: "Point of Interest" }
    ];
    const types = [];
    for (const def of defaults) {
      const type = await this.getOrCreate(def.slug, def.name);
      types.push(type);
    }
    return types;
  }
}
export {
  PlaceTypeCollection
};
//# sourceMappingURL=index5.js.map
