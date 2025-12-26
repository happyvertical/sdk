/**
 * Headline Card Generator
 *
 * Generates branded social media / OG images with article titles.
 * Uses Satori (Vercel's JSX-to-SVG) and resvg for PNG output.
 *
 * @example
 * ```typescript
 * import { generateHeadlineCard } from '@happyvertical/images';
 *
 * const result = await generateHeadlineCard('Breaking: Major Discovery', {
 *   brandColor: '#1a56db',
 *   subtitle: 'Science News',
 *   template: 'news'
 * });
 *
 * await writeFile('og-image.png', result.buffer);
 * ```
 */

/**
 * Satori-compatible element structure (React-like JSX representation)
 * Satori uses this format without needing actual React
 */
type SatoriElement = {
  type: string;
  props: {
    style?: Record<string, string | number | undefined>;
    children?: SatoriChildren;
    [key: string]: any;
  };
};

type SatoriChildren =
  | SatoriElement
  | SatoriElement[]
  | string
  | null
  | undefined
  | (SatoriElement | null | undefined)[];

// ============================================================================
// Types
// ============================================================================

/**
 * Template style for headline cards
 */
export type HeadlineCardTemplate = 'default' | 'news' | 'minimal';

/**
 * Options for headline card generation
 */
export interface HeadlineCardOptions {
  /**
   * Width in pixels
   * @default 1200
   */
  width?: number;

  /**
   * Height in pixels
   * @default 630
   */
  height?: number;

  /**
   * Primary brand color (hex)
   * @default '#3b82f6'
   */
  brandColor?: string;

  /**
   * Background color (hex)
   * @default '#ffffff'
   */
  backgroundColor?: string;

  /**
   * Secondary text color (hex)
   * @default '#64748b'
   */
  textColor?: string;

  /**
   * Optional subtitle/category
   */
  subtitle?: string;

  /**
   * Optional logo URL (will be fetched and embedded)
   */
  logoUrl?: string;

  /**
   * Logo data as base64 or buffer (alternative to logoUrl)
   */
  logoData?: string | Buffer;

  /**
   * Card template style
   * @default 'default'
   */
  template?: HeadlineCardTemplate;

  /**
   * Font family name (must be available via Google Fonts or provide fontData)
   * @default 'Inter'
   */
  fontFamily?: string;

  /**
   * Custom font data (loaded font buffer)
   */
  fontData?: ArrayBuffer;
}

/**
 * Result from headline card generation
 */
export interface HeadlineCardResult {
  /** PNG image buffer */
  buffer: Buffer;
  /** Image width */
  width: number;
  /** Image height */
  height: number;
  /** MIME type (always image/png) */
  mimeType: 'image/png';
}

// ============================================================================
// Font Loading
// ============================================================================

/**
 * Cached font data
 */
let cachedFontData: ArrayBuffer | null = null;
let cachedFontName: string | null = null;

/**
 * Load font from Google Fonts
 *
 * Note: Satori requires TTF/OTF/WOFF format, NOT WOFF2.
 * We use an old browser User-Agent to get WOFF format from Google Fonts.
 */
async function loadGoogleFont(fontName: string): Promise<ArrayBuffer> {
  // Return cached font if same font
  if (cachedFontData && cachedFontName === fontName) {
    return cachedFontData;
  }

  // Fetch font from Google Fonts
  const fontUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;600;700&display=swap`;

  const cssResponse = await fetch(fontUrl, {
    headers: {
      // Use an old user agent to get WOFF format (Satori doesn't support woff2)
      'User-Agent':
        'Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; Trident/6.0)',
    },
  });

  if (!cssResponse.ok) {
    throw new Error(`Failed to fetch font CSS: ${cssResponse.statusText}`);
  }

  const css = await cssResponse.text();

  // Extract font URL from CSS - look for format('woff') or format('truetype')
  // Google Fonts URLs don't have file extensions, so match by format declaration
  // Priority: truetype (TTF) > woff > any URL (avoid woff2)
  let urlMatch = css.match(
    /src:\s*url\(([^)]+)\)\s*format\(['"]truetype['"]\)/,
  );
  if (!urlMatch) {
    urlMatch = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"]woff['"]\)/);
  }
  if (!urlMatch) {
    // Fallback: just get any URL that's not followed by woff2
    urlMatch = css.match(/src:\s*url\(([^)]+)\)(?!\s*format\(['"]woff2['"]\))/);
  }
  if (!urlMatch) {
    throw new Error(
      `Could not find compatible font URL in CSS for ${fontName}. CSS: ${css.slice(0, 300)}...`,
    );
  }

  const fontFileUrl = urlMatch[1];
  const fontResponse = await fetch(fontFileUrl);

  if (!fontResponse.ok) {
    throw new Error(`Failed to fetch font file: ${fontResponse.statusText}`);
  }

  cachedFontData = await fontResponse.arrayBuffer();
  cachedFontName = fontName;

  return cachedFontData;
}

// ============================================================================
// Template Renderers
// ============================================================================

interface TemplateProps {
  title: string;
  options: Required<
    Pick<
      HeadlineCardOptions,
      | 'width'
      | 'height'
      | 'brandColor'
      | 'backgroundColor'
      | 'textColor'
      | 'fontFamily'
    >
  > &
    HeadlineCardOptions;
}

/**
 * Default template - clean with accent bar
 */
function renderDefaultTemplate({
  title,
  options,
}: TemplateProps): SatoriElement {
  const {
    width,
    height,
    brandColor,
    backgroundColor,
    textColor,
    subtitle,
    fontFamily,
  } = options;

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        backgroundColor,
        padding: '60px',
        fontFamily,
      },
      children: [
        // Top accent bar
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '8px',
              backgroundColor: brandColor,
            },
          },
        },
        // Subtitle
        subtitle
          ? {
              type: 'div',
              props: {
                style: {
                  fontSize: '24px',
                  fontWeight: 600,
                  color: brandColor,
                  marginBottom: '20px',
                  textTransform: 'uppercase',
                  letterSpacing: '2px',
                },
                children: subtitle,
              },
            }
          : null,
        // Title
        {
          type: 'div',
          props: {
            style: {
              fontSize: Math.min(72, Math.floor(width / (title.length * 0.6))),
              fontWeight: 700,
              color: '#1e293b',
              lineHeight: 1.2,
              maxWidth: '90%',
            },
            children: title,
          },
        },
        // Bottom accent
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              bottom: '60px',
              left: '60px',
              width: '80px',
              height: '4px',
              backgroundColor: brandColor,
            },
          },
        },
      ].filter(Boolean),
    },
  };
}

/**
 * News template - bold with side accent
 */
function renderNewsTemplate({ title, options }: TemplateProps): SatoriElement {
  const {
    width,
    height,
    brandColor,
    backgroundColor,
    textColor,
    subtitle,
    fontFamily,
  } = options;

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        height: '100%',
        backgroundColor,
        fontFamily,
      },
      children: [
        // Left accent bar
        {
          type: 'div',
          props: {
            style: {
              width: '16px',
              height: '100%',
              backgroundColor: brandColor,
            },
          },
        },
        // Content area
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              flex: 1,
              padding: '60px',
            },
            children: [
              // Category badge (using flex with alignSelf since Satori doesn't support inline-flex)
              subtitle
                ? {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        alignSelf: 'flex-start',
                        backgroundColor: brandColor,
                        color: '#ffffff',
                        fontSize: '18px',
                        fontWeight: 600,
                        padding: '8px 16px',
                        borderRadius: '4px',
                        marginBottom: '24px',
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                      },
                      children: subtitle,
                    },
                  }
                : null,
              // Title
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: Math.min(
                      64,
                      Math.floor((width - 100) / (title.length * 0.5)),
                    ),
                    fontWeight: 700,
                    color: '#0f172a',
                    lineHeight: 1.15,
                  },
                  children: title,
                },
              },
            ].filter(Boolean),
          },
        },
      ],
    },
  };
}

/**
 * Minimal template - simple and elegant
 */
function renderMinimalTemplate({
  title,
  options,
}: TemplateProps): SatoriElement {
  const { width, height, brandColor, backgroundColor, textColor, fontFamily } =
    options;

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        backgroundColor,
        padding: '80px',
        fontFamily,
      },
      children: [
        // Decorative line
        {
          type: 'div',
          props: {
            style: {
              width: '60px',
              height: '3px',
              backgroundColor: brandColor,
              marginBottom: '40px',
            },
          },
        },
        // Title
        {
          type: 'div',
          props: {
            style: {
              fontSize: Math.min(56, Math.floor(width / (title.length * 0.55))),
              fontWeight: 600,
              color: '#334155',
              lineHeight: 1.3,
              textAlign: 'center',
              maxWidth: '85%',
            },
            children: title,
          },
        },
        // Decorative line
        {
          type: 'div',
          props: {
            style: {
              width: '60px',
              height: '3px',
              backgroundColor: brandColor,
              marginTop: '40px',
            },
          },
        },
      ],
    },
  };
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Generate a headline card image
 *
 * Creates a branded social media / OG image with the article title.
 * Supports multiple templates and customization options.
 *
 * @param title - The headline text to display
 * @param options - Customization options
 * @returns Promise resolving to PNG image result
 *
 * @example Basic usage
 * ```typescript
 * const result = await generateHeadlineCard('Breaking News: AI Advances');
 * await fs.writeFile('og-image.png', result.buffer);
 * ```
 *
 * @example With branding
 * ```typescript
 * const result = await generateHeadlineCard('Local Council Approves Budget', {
 *   brandColor: '#1a56db',
 *   subtitle: 'Town News',
 *   template: 'news'
 * });
 * ```
 *
 * @example Full customization
 * ```typescript
 * const result = await generateHeadlineCard('The Future of Technology', {
 *   width: 1200,
 *   height: 630,
 *   brandColor: '#059669',
 *   backgroundColor: '#f8fafc',
 *   subtitle: 'Technology',
 *   template: 'minimal',
 *   fontFamily: 'Roboto'
 * });
 * ```
 */
export async function generateHeadlineCard(
  title: string,
  options: HeadlineCardOptions = {},
): Promise<HeadlineCardResult> {
  // Apply defaults
  const width = options.width ?? 1200;
  const height = options.height ?? 630;
  const brandColor = options.brandColor ?? '#3b82f6';
  const backgroundColor = options.backgroundColor ?? '#ffffff';
  const textColor = options.textColor ?? '#64748b';
  const template = options.template ?? 'default';
  const fontFamily = options.fontFamily ?? 'Inter';

  const resolvedOptions = {
    ...options,
    width,
    height,
    brandColor,
    backgroundColor,
    textColor,
    fontFamily,
  };

  // Load satori and resvg dynamically
  const [{ default: satori }, { Resvg }] = await Promise.all([
    import('satori'),
    import('@resvg/resvg-js'),
  ]);

  // Load font
  const fontData = options.fontData ?? (await loadGoogleFont(fontFamily));

  // Select template renderer
  let content: SatoriElement;
  switch (template) {
    case 'news':
      content = renderNewsTemplate({ title, options: resolvedOptions });
      break;
    case 'minimal':
      content = renderMinimalTemplate({ title, options: resolvedOptions });
      break;
    default:
      content = renderDefaultTemplate({ title, options: resolvedOptions });
  }

  // Generate SVG with satori
  // Cast to any because satori expects React elements but accepts our structure
  const svg = await satori(content as any, {
    width,
    height,
    fonts: [
      {
        name: fontFamily,
        data: fontData,
        weight: 400,
        style: 'normal',
      },
      {
        name: fontFamily,
        data: fontData,
        weight: 600,
        style: 'normal',
      },
      {
        name: fontFamily,
        data: fontData,
        weight: 700,
        style: 'normal',
      },
    ],
  });

  // Convert SVG to PNG with resvg
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: width,
    },
  });

  const pngData = resvg.render();
  const buffer = Buffer.from(pngData.asPng());

  return {
    buffer,
    width,
    height,
    mimeType: 'image/png',
  };
}

/**
 * Reset cached font data (useful for testing)
 */
export function resetFontCache(): void {
  cachedFontData = null;
  cachedFontName = null;
}
