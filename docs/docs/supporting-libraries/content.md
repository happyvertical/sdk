---
id: content
title: "@have/content: AI-Powered Content Processing"
sidebar_label: "@have/content"
sidebar_position: 1
---

# @have/content: AI-Powered Content Processing

The `@have/content` module provides enterprise-grade content processing capabilities with built-in AI analysis, designed as a SMRT module for seamless integration with the framework.

## Overview

`@have/content` handles structured content management with AI-powered analysis:

- **📄 Content Management**: Unified interface for documents and text content
- **🤖 AI Integration**: Built-in content analysis with `do()` and `is()` methods
- **🔗 Reference System**: Link and organize related content pieces
- **📊 Collection Operations**: Batch processing and content organization
- **🗄️ SMRT Integration**: Automatic database persistence and type safety

## Core Classes

### Content Class

The main content representation with AI capabilities:

```typescript
import { Content } from '@have/content';
import { getAIClient } from '@have/ai';

// Create content with AI capabilities
const content = new Content({
  title: 'Research Paper on AI Trends',
  body: 'Large language models have revolutionized...',
  type: 'research',
  source: 'web_scraping',
  status: 'published',
  ai: await getAIClient({ provider: 'openai' })
});

// Use built-in AI methods
const summary = await content.do('Create a 100-word summary');
const isAcademic = await content.is('written in academic style');
const keyTopics = await content.do('Extract the 5 main topics as JSON array');

// Save to database (inherited from SMRT BaseObject)
await content.save();
```

### Contents Collection

Manage collections of content with batch operations:

```typescript
import { Contents } from '@have/content';

const contents = new Contents({});

// Add content to collection
await contents.add(content);

// Query and filter
const researchContent = await contents.list({
  where: {
    type: 'research',
    status: 'published',
    'created_at >': new Date('2024-01-01')
  },
  limit: 50
});

// Batch operations
await contents.updateWhere(
  { status: 'draft' },
  { status: 'review' }
);
```

## Content Properties

### Core Metadata
```typescript
interface ContentOptions {
  type?: string | null;              // Content classification
  fileKey?: string | null;           // File storage reference
  author?: string | null;            // Content author
  title?: string;                    // Content title
  description?: string | null;       // Short summary
  body?: string;                     // Main content text
  publish_date?: Date | null;        // Publication date
  url?: string | null;              // Source URL
  source?: string | null;           // Origin identifier
  status?: 'published' | 'draft' | 'archived' | 'deleted';
  state?: 'deprecated' | 'active' | 'highlighted';
}
```

### AI-Powered Methods

**Content Analysis**:
```typescript
// Analyze content characteristics
const isFactual = await content.is('presenting factual information');
const isBiased = await content.is('showing clear political bias');
const isRecent = await content.is('discussing events from 2024');

// Extract structured information
const entities = await content.do('Extract all named entities as JSON');
const sentiment = await content.do('Analyze sentiment: positive, negative, or neutral');
const readingLevel = await content.do('Assess reading level: elementary, middle, high, college');
```

**Content Transformation**:
```typescript
// Generate derivatives
const abstract = await content.do('Create a 150-word academic abstract');
const bullets = await content.do('Convert to bullet points highlighting key facts');
const outline = await content.do('Create a hierarchical outline structure');

// Format conversion
const markdown = await content.do('Convert to clean Markdown format');
const slides = await content.do('Create 5 presentation slides from this content');
```

**Quality Assessment**:
```typescript
// Content quality checks
const hasEvidence = await content.is('supported by evidence and citations');
const isComplete = await content.is('providing complete information on the topic');
const needsUpdate = await content.is('containing outdated information');

// Credibility analysis
const credibilityScore = await content.do(
  'Rate credibility 1-10 based on sources, citations, and objectivity'
);
```

## Reference System

Link and organize related content:

```typescript
// Add references to other content
await content.addReference(relatedContent);
await content.addReference('https://example.com/source');

// Load reference network
await content.loadReferences();
const references = await content.getReferences();

// Reference analysis
const citationNetwork = await content.do(
  'Analyze how this content relates to its references'
);
```

## Real-World Examples

### Web Content Analysis

```typescript
import { Content } from '@have/content';
import { WebScraperTool } from '@have/spider';

async function analyzeWebContent(url: string): Promise<Content> {
  const scraper = new WebScraperTool();
  const rawContent = await scraper.extractContent(url);

  const content = new Content({
    url: url,
    title: rawContent.title,
    body: rawContent.text,
    source: 'web_scraping',
    status: 'published',
    ai: await getAIClient({ provider: 'openai' })
  });

  // AI-powered categorization
  const category = await content.do(
    'Categorize as: news, research, opinion, marketing, documentation'
  );
  content.type = category;

  // Quality assessment
  const quality = await content.do(
    'Rate content quality 1-10 considering accuracy, completeness, and clarity'
  );

  // Extract metadata
  const keyPoints = await content.do(
    'Extract 5-7 key points as JSON array'
  );

  content.description = `Quality: ${quality}/10. Key insights: ${keyPoints.slice(0, 2).join(', ')}`;

  await content.save();
  return content;
}
```

### Document Processing Pipeline

```typescript
import { Content, Contents } from '@have/content';
import { PDFProcessor } from '@have/pdf';

class DocumentProcessor {
  private contents: Contents;

  constructor() {
    this.contents = new Contents({});
  }

  async processDocument(filePath: string): Promise<Content> {
    // Extract text from PDF
    const pdf = new PDFProcessor();
    const extractedText = await pdf.extractText(filePath);

    const content = new Content({
      title: path.basename(filePath, '.pdf'),
      body: extractedText,
      type: 'document',
      fileKey: filePath,
      source: 'pdf_upload',
      status: 'published',
      ai: await getAIClient({ provider: 'openai' })
    });

    // Document classification
    const docType = await content.do(
      'Classify document type: contract, report, manual, research, legal, financial'
    );
    content.type = docType;

    // Extract structured data
    const metadata = await content.do(`
      Extract document metadata as JSON:
      {
        "documentDate": "YYYY-MM-DD or null",
        "authors": ["author1", "author2"],
        "keywords": ["keyword1", "keyword2"],
        "summary": "brief summary",
        "pageCount": number
      }
    `);

    const parsedMetadata = JSON.parse(metadata);
    content.description = parsedMetadata.summary;
    content.author = parsedMetadata.authors.join(', ');

    // Content analysis
    const hasPersonalInfo = await content.is('containing personal or sensitive information');
    if (hasPersonalInfo) {
      content.state = 'deprecated'; // Flag for review
    }

    await content.save();
    return content;
  }

  async generateReport(query: string): Promise<string> {
    // Find relevant content
    const relevantContent = await this.contents.list({
      where: {
        'body LIKE': `%${query}%`,
        status: 'published',
        state: 'active'
      }
    });

    // Synthesize findings
    const combinedText = relevantContent.map(c =>
      `Title: ${c.title}\nContent: ${c.body.substring(0, 1000)}`
    ).join('\n\n---\n\n');

    const synthesis = new Content({
      title: `Analysis Report: ${query}`,
      type: 'synthesis',
      source: 'analysis',
      status: 'draft',
      ai: await getAIClient({ provider: 'openai' })
    });

    const report = await synthesis.do(`
      Create a comprehensive analysis report based on these documents about "${query}":

      ${combinedText}

      Structure the report with:
      1. Executive Summary
      2. Key Findings
      3. Supporting Evidence
      4. Conclusions
      5. Recommendations
    `);

    synthesis.body = report;
    await synthesis.save();

    return report;
  }
}
```

### Content Synthesis and Research

```typescript
class ResearchSynthesizer {
  private contents: Contents;

  constructor() {
    this.contents = new Contents({});
  }

  async synthesizeResearch(topic: string): Promise<Content> {
    // Gather related content
    const relatedContent = await this.contents.list({
      where: {
        'body LIKE': `%${topic}%`,
        status: 'published',
        state: 'active'
      },
      orderBy: 'created_at DESC',
      limit: 20
    });

    // Create synthesis content
    const synthesis = new Content({
      title: `Research Synthesis: ${topic}`,
      type: 'synthesis',
      source: 'ai_analysis',
      status: 'draft',
      ai: await getAIClient({ provider: 'openai' })
    });

    // Combine content for analysis
    const sourceText = relatedContent.map(c => ({
      title: c.title,
      content: c.body.substring(0, 2000),
      source: c.source,
      date: c.created_at
    }));

    const analysis = await synthesis.do(`
      Analyze these research sources about "${topic}" and create a comprehensive synthesis:

      ${JSON.stringify(sourceText, null, 2)}

      Provide:
      1. Thematic analysis of common patterns
      2. Identification of conflicting viewpoints
      3. Assessment of evidence quality
      4. Gap analysis for further research
      5. Actionable insights and implications
    `);

    synthesis.body = analysis;

    // Add references to source content
    for (const source of relatedContent) {
      await synthesis.addReference(source);
    }

    // Generate quality metadata
    const confidence = await synthesis.do(
      'Rate confidence in this synthesis 1-10 based on source quality and coverage'
    );

    synthesis.description = `Synthesis of ${relatedContent.length} sources. Confidence: ${confidence}/10`;

    await synthesis.save();
    return synthesis;
  }

  async trackContentEvolution(contentId: string): Promise<string[]> {
    const content = await this.contents.get(contentId);
    if (!content) return [];

    return await content.do(`
      Trace how understanding of this topic has evolved by analyzing:
      1. Publication dates and chronological progression
      2. Changes in methodology or perspective
      3. Evolution of terminology or concepts
      4. Shifts in consensus or debate

      Return as timeline of key developments.
    `);
  }
}
```

## Integration with SMRT Framework

### SMRT BaseObject Features

Content inherits all SMRT capabilities:

```typescript
// Database persistence
await content.save();
await content.delete();

// Relationships
const relatedContent = await content.getRelated('type');

// Validation
const isValid = await content.validate();

// Lifecycle hooks
content.beforeSave = async () => {
  // Auto-generate slug from title
  if (!this.slug && this.title) {
    this.slug = await this.getSlug();
  }
};
```

### Collection Features

```typescript
const contents = new Contents({});

// CRUD operations
await contents.create({ title: 'New Content' });
const content = await contents.get(contentId);
await contents.update(contentId, { status: 'published' });
await contents.delete(contentId);

// Querying
const results = await contents.list({
  where: { type: 'research' },
  orderBy: 'created_at DESC',
  limit: 10
});

// Aggregation
const stats = await contents.aggregate([
  { $group: { _id: '$type', count: { $sum: 1 } } }
]);
```

## Performance and Best Practices

### Optimization Strategies

**Content Chunking**:
```typescript
// For large content, process in chunks
async function processLargeContent(content: Content): Promise<void> {
  const chunks = content.body.match(/.{1,2000}/g) || [];

  const analyses = await Promise.all(
    chunks.map(chunk => content.do(`Analyze this section: ${chunk}`))
  );

  const summary = await content.do(
    `Synthesize these section analyses: ${analyses.join('\n\n')}`
  );

  content.description = summary;
}
```

**Batch Processing**:
```typescript
// Process multiple content pieces efficiently
async function batchAnalyze(contents: Content[]): Promise<void> {
  const batches = chunk(contents, 10); // Process 10 at a time

  for (const batch of batches) {
    await Promise.all(
      batch.map(async content => {
        const category = await content.do('Categorize this content');
        content.type = category;
        return content.save();
      })
    );
  }
}
```

### Caching Strategies

```typescript
// Cache expensive AI operations
const analysisCache = new Map<string, string>();

Content.prototype.cachedDo = async function(prompt: string): Promise<string> {
  const cacheKey = `${this.id}-${hashString(prompt)}`;

  if (analysisCache.has(cacheKey)) {
    return analysisCache.get(cacheKey)!;
  }

  const result = await this.do(prompt);
  analysisCache.set(cacheKey, result);
  return result;
};
```

## Next Steps

<div className="row">
  <div className="col col--4">
    <div className="feature-card">
      <h3>🧠 Research Agent Tutorial</h3>
      <p>Build a sophisticated research agent using the Content module</p>
      <a href="/docs/tutorials/build-research-agent" className="nav-pill">Build Research Agent →</a>
    </div>
  </div>
  <div className="col col--4">
    <div className="feature-card">
      <h3>🕷️ Web Scraping Integration</h3>
      <p>Combine Content with Spider for web content analysis</p>
      <a href="/docs/supporting-libraries/spider" className="nav-pill">Explore Spider →</a>
    </div>
  </div>
  <div className="col col--4">
    <div className="feature-card">
      <h3>📄 PDF Processing</h3>
      <p>Extract and analyze content from PDF documents</p>
      <a href="/docs/supporting-libraries/pdf" className="nav-pill">Process PDFs →</a>
    </div>
  </div>
</div>

---

<div className="callout info">
  <strong>💡 Pro Tip:</strong> The Content module shines when combined with other SMRT libraries. Use Spider for web content, PDF for documents, and Files for local content to create comprehensive content processing pipelines.
</div>