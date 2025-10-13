import { SmrtCollection } from "@have/smrt";
import { Asset } from "./index5.js";
class AssetCollection extends SmrtCollection {
  static _itemClass = Asset;
  /**
   * Add a tag to an asset (uses @have/tags)
   *
   * @param assetId - The asset ID to tag
   * @param tagSlug - The tag slug from @have/tags
   */
  async addTag(assetId, tagSlug) {
    const db = await this.getDb();
    await db.prepare(
      "INSERT OR IGNORE INTO asset_tags (asset_id, tag_slug, created_at) VALUES (?, ?, ?)"
    ).run(assetId, tagSlug, (/* @__PURE__ */ new Date()).toISOString());
  }
  /**
   * Remove a tag from an asset
   *
   * @param assetId - The asset ID
   * @param tagSlug - The tag slug to remove
   */
  async removeTag(assetId, tagSlug) {
    const db = await this.getDb();
    await db.prepare("DELETE FROM asset_tags WHERE asset_id = ? AND tag_slug = ?").run(assetId, tagSlug);
  }
  /**
   * Get all assets with a specific tag
   *
   * @param tagSlug - The tag slug to filter by
   * @returns Array of assets with this tag
   */
  async getByTag(tagSlug) {
    const db = await this.getDb();
    const rows = await db.prepare("SELECT asset_id FROM asset_tags WHERE tag_slug = ?").all(tagSlug);
    const assets = [];
    for (const row of rows) {
      const asset = await this.get({ id: row.asset_id });
      if (asset) assets.push(asset);
    }
    return assets;
  }
  /**
   * Get assets by type
   *
   * @param typeSlug - The asset type slug (e.g., 'image', 'video')
   * @returns Array of assets matching the type
   */
  async getByType(typeSlug) {
    return await this.list({ where: { typeSlug } });
  }
  /**
   * Get assets by status
   *
   * @param statusSlug - The asset status slug (e.g., 'published', 'draft')
   * @returns Array of assets matching the status
   */
  async getByStatus(statusSlug) {
    return await this.list({ where: { statusSlug } });
  }
  /**
   * Get assets by owner
   *
   * @param ownerProfileId - The profile ID of the owner
   * @returns Array of assets owned by this profile
   */
  async getByOwner(ownerProfileId) {
    return await this.list({ where: { ownerProfileId } });
  }
  /**
   * Create a new version of an existing asset
   *
   * @param primaryVersionId - The primary version ID (first version's ID)
   * @param newSourceUri - The new source URI for this version
   * @param updates - Optional additional updates
   * @returns The newly created asset version
   */
  async createNewVersion(primaryVersionId, newSourceUri, updates = {}) {
    const versions = await this.listVersions(primaryVersionId);
    if (versions.length === 0) {
      throw new Error(
        `No asset found with primary version ID: ${primaryVersionId}`
      );
    }
    versions.sort((a, b) => b.version - a.version);
    const latestVersion = versions[0];
    return await this.create({
      ...latestVersion,
      id: void 0,
      // Generate new ID
      sourceUri: newSourceUri,
      version: latestVersion.version + 1,
      primaryVersionId,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date(),
      ...updates
    });
  }
  /**
   * Get the latest version of an asset
   *
   * @param primaryVersionId - The primary version ID
   * @returns The latest version or null
   */
  async getLatestVersion(primaryVersionId) {
    const versions = await this.listVersions(primaryVersionId);
    if (versions.length === 0) return null;
    versions.sort((a, b) => b.version - a.version);
    return versions[0];
  }
  /**
   * List all versions of an asset
   *
   * @param primaryVersionId - The primary version ID
   * @returns Array of all asset versions, ordered by version number
   */
  async listVersions(primaryVersionId) {
    const db = await this.getDb();
    const rows = await db.prepare(
      "SELECT * FROM assets WHERE primary_version_id = ? OR id = ? ORDER BY version ASC"
    ).all(primaryVersionId, primaryVersionId);
    return rows.map((row) => {
      const asset = new Asset();
      Object.assign(asset, row);
      return asset;
    });
  }
  /**
   * Get child assets (derivatives) of a parent asset
   *
   * @param parentId - The parent asset ID
   * @returns Array of child assets
   */
  async getChildren(parentId) {
    return await this.list({ where: { parentId } });
  }
  /**
   * Get assets by MIME type pattern
   *
   * @param mimePattern - MIME type pattern (e.g., 'image/*', 'video/mp4')
   * @returns Array of matching assets
   */
  async getByMimeType(mimePattern) {
    const db = await this.getDb();
    const pattern = mimePattern.replace("*", "%");
    const rows = await db.prepare("SELECT * FROM assets WHERE mime_type LIKE ?").all(pattern);
    return rows.map((row) => {
      const asset = new Asset();
      Object.assign(asset, row);
      return asset;
    });
  }
}
export {
  AssetCollection
};
//# sourceMappingURL=index9.js.map
