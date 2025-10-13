import { SmrtCollection } from "@have/smrt";
import { Tag } from "./index2.js";
class TagCollection extends SmrtCollection {
  static _itemClass = Tag;
  /**
   * Get or create a tag with context
   *
   * @param slug - Tag slug
   * @param context - Tag context (default: 'global')
   * @returns Tag instance
   */
  async getOrCreate(slug, context = "global") {
    const existing = await this.list({
      where: { slug, context },
      limit: 1
    });
    if (existing.length > 0) {
      return existing[0];
    }
    return await this.create({
      slug,
      name: slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      context,
      level: 0
    });
  }
  /**
   * List tags by context with optional parent filtering
   *
   * @param context - The context to filter by
   * @param parentSlug - Optional parent slug to filter children
   * @returns Array of matching tags
   */
  async listByContext(context, parentSlug) {
    const where = { context };
    if (parentSlug !== void 0) {
      where.parentSlug = parentSlug;
    }
    return await this.list({ where });
  }
  /**
   * Get root tags (no parent) for a context
   *
   * @param context - The context to filter by (default: 'global')
   * @returns Array of root tags
   */
  async getRootTags(context = "global") {
    return await this.list({
      where: { context, parentSlug: null }
    });
  }
  /**
   * Get immediate children of a parent tag
   *
   * @param parentSlug - The parent tag slug
   * @returns Array of child tags
   */
  async getChildren(parentSlug) {
    return await this.list({
      where: { parentSlug }
    });
  }
  /**
   * Get tag hierarchy (all ancestors and descendants)
   *
   * @param slug - The tag slug
   * @returns Object with ancestors, current tag, and descendants
   */
  async getHierarchy(slug) {
    const tag = await this.get({ slug });
    if (!tag) throw new Error(`Tag '${slug}' not found`);
    const ancestors = await this.getAncestors(tag);
    const descendants = await this.getDescendants(tag);
    return { ancestors, current: tag, descendants };
  }
  /**
   * Move a tag to a new parent (updates level automatically)
   *
   * @param slug - The tag to move
   * @param newParentSlug - The new parent slug (null for root)
   * @throws Error if circular reference detected
   */
  async moveTag(slug, newParentSlug) {
    const tag = await this.get({ slug });
    if (!tag) throw new Error(`Tag '${slug}' not found`);
    if (newParentSlug) {
      const hasCircular = await this.hasCircularReference(slug, newParentSlug);
      if (hasCircular) {
        throw new Error(
          `Cannot move tag: circular reference detected (${slug} -> ${newParentSlug})`
        );
      }
    }
    const newLevel = await this.calculateLevel(newParentSlug);
    tag.parentSlug = newParentSlug || "";
    tag.level = newLevel;
    await tag.save();
    await this.updateDescendantLevels(tag);
  }
  /**
   * Merge one tag into another (updates all references)
   *
   * Note: This method updates the tag itself but consuming packages
   * are responsible for updating their join tables (e.g., asset_tags)
   *
   * @param fromSlug - The tag to merge from
   * @param toSlug - The tag to merge into
   */
  async mergeTag(fromSlug, toSlug) {
    const fromTag = await this.get({ slug: fromSlug });
    const toTag = await this.get({ slug: toSlug });
    if (!fromTag) throw new Error(`Source tag '${fromSlug}' not found`);
    if (!toTag) throw new Error(`Target tag '${toSlug}' not found`);
    const children = await this.getChildren(fromSlug);
    for (const child of children) {
      child.parentSlug = toSlug;
      await child.save();
    }
    const { TagAliasCollection } = await import("./index5.js");
    const aliasCollection = await TagAliasCollection.create(this.options);
    const aliases = await aliasCollection.list({
      where: { tagSlug: fromSlug }
    });
    for (const alias of aliases) {
      alias.tagSlug = toSlug;
      await alias.save();
    }
    await fromTag.delete();
  }
  /**
   * Remove tags with no references (cleanup unused tags)
   *
   * Note: This requires consuming packages to provide usage information.
   * By default, only removes tags with no children and no aliases.
   *
   * @param context - Optional context to filter cleanup
   */
  async cleanupUnused(context) {
    const where = {};
    if (context) where.context = context;
    const tags = await this.list({ where });
    const { TagAliasCollection } = await import("./index5.js");
    const aliasCollection = await TagAliasCollection.create(this.options);
    let deletedCount = 0;
    for (const tag of tags) {
      const children = await this.getChildren(tag.slug);
      if (children.length > 0) continue;
      const aliases = await aliasCollection.list({
        where: { tagSlug: tag.slug }
      });
      if (aliases.length > 0) continue;
      await tag.delete();
      deletedCount++;
    }
    return deletedCount;
  }
  /**
   * Calculate hierarchy level for a tag
   *
   * @param parentSlug - The parent tag slug (null for root)
   * @returns The calculated level
   */
  async calculateLevel(parentSlug) {
    if (!parentSlug) return 0;
    const parent = await this.get({ slug: parentSlug });
    if (!parent) return 0;
    return parent.level + 1;
  }
  /**
   * Check if moving a tag would create a circular reference
   *
   * @param slug - The tag being moved
   * @param newParentSlug - The proposed new parent
   * @returns True if circular reference detected
   */
  async hasCircularReference(slug, newParentSlug) {
    let current = newParentSlug;
    while (current) {
      if (current === slug) return true;
      const parent = await this.get({ slug: current });
      if (!parent || !parent.parentSlug) break;
      current = parent.parentSlug;
    }
    return false;
  }
  /**
   * Get all ancestor tags (recursive)
   *
   * @param tag - The tag to get ancestors for
   * @returns Array of ancestor tags from root to immediate parent
   */
  async getAncestors(tag) {
    const ancestors = [];
    let current = tag;
    while (current.parentSlug) {
      const parent = await this.get({ slug: current.parentSlug });
      if (!parent) break;
      ancestors.unshift(parent);
      current = parent;
    }
    return ancestors;
  }
  /**
   * Get all descendant tags (recursive)
   *
   * @param tag - The tag to get descendants for
   * @returns Array of all descendant tags
   */
  async getDescendants(tag) {
    const children = await this.list({ where: { parentSlug: tag.slug } });
    const descendants = [...children];
    for (const child of children) {
      const childDescendants = await this.getDescendants(child);
      descendants.push(...childDescendants);
    }
    return descendants;
  }
  /**
   * Update levels for all descendants after moving a tag
   *
   * @param tag - The tag that was moved
   */
  async updateDescendantLevels(tag) {
    const children = await this.getChildren(tag.slug);
    for (const child of children) {
      child.level = tag.level + 1;
      await child.save();
      await this.updateDescendantLevels(child);
    }
  }
}
export {
  TagCollection
};
//# sourceMappingURL=index4.js.map
