function validateSlug(slug) {
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return slugPattern.test(slug);
}
function sanitizeSlug(input) {
  return input.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
async function hasCircularReference(slug, parentSlug, tagCollection) {
  let current = parentSlug;
  while (current) {
    if (current === slug) return true;
    const parent = await tagCollection.get({ slug: current });
    if (!parent || !parent.parentSlug) break;
    current = parent.parentSlug;
  }
  return false;
}
async function calculateLevel(parentSlug, tagCollection) {
  if (!parentSlug) return 0;
  const parent = await tagCollection.get({ slug: parentSlug });
  if (!parent) return 0;
  return parent.level + 1;
}
async function generateUniqueSlug(name, context, tagCollection) {
  const baseSlug = sanitizeSlug(name);
  let slug = baseSlug;
  let counter = 1;
  while (true) {
    const existing = await tagCollection.list({
      where: { slug, context },
      limit: 1
    });
    if (existing.length === 0) break;
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  return slug;
}
export {
  calculateLevel,
  generateUniqueSlug,
  hasCircularReference,
  sanitizeSlug,
  validateSlug
};
//# sourceMappingURL=index6.js.map
