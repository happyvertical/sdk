import { SmrtCollection } from "@have/smrt";
import { AssetType } from "./index2.js";
class AssetTypeCollection extends SmrtCollection {
  static _itemClass = AssetType;
  /**
   * Get or create an asset type by slug
   *
   * @param slug - The asset type slug
   * @param name - The display name (defaults to slug)
   * @param description - Optional description
   * @returns The existing or newly created AssetType
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
   * Initialize common asset types
   *
   * Creates standard asset types if they don't exist:
   * - image
   * - video
   * - document
   * - audio
   * - folder
   */
  async initializeCommonTypes() {
    await this.getOrCreate(
      "image",
      "Image",
      "Image files (JPEG, PNG, GIF, etc.)"
    );
    await this.getOrCreate(
      "video",
      "Video",
      "Video files (MP4, AVI, MOV, etc.)"
    );
    await this.getOrCreate(
      "document",
      "Document",
      "Document files (PDF, DOCX, TXT, etc.)"
    );
    await this.getOrCreate(
      "audio",
      "Audio",
      "Audio files (MP3, WAV, AAC, etc.)"
    );
    await this.getOrCreate(
      "folder",
      "Folder",
      "Container for organizing assets"
    );
  }
}
export {
  AssetTypeCollection
};
//# sourceMappingURL=index6.js.map
