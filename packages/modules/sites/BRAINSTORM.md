sites
  repo
  domain
  options json|text
  metadata

site_pages
  path
  parent_path
  etc...
  [will be used to build a sitemap]


@have/content "types"
-------------
 pages - will be sitemap
 configs - for managed sites, configuration files   


- provides functionality for monitoring and managing multiple sites
- sites will be able to load their options via async operation in smrt.config.ts
- sites can register themselves
- method for spider to crawl existing site and build profile including sitemap in pages


