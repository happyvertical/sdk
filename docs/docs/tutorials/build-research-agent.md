---
id: build-research-agent
title: "Tutorial: Build a Research Agent"
sidebar_label: Research Agent
sidebar_position: 1
---

# Tutorial: Build a Research Agent

In this comprehensive tutorial, we'll build a **Research Agent** that can intelligently gather information from the web, analyze content, and create structured research notes. This project showcases the full power of the SMRT framework.

## What We'll Build

Our Research Agent will be able to:
- Extract content from web sources with AI-powered analysis
- Process and categorize content automatically
- Create structured research notes with references
- Generate comprehensive reports from collected content
- Use the real `@smrt/content` module for professional content management

## Prerequisites

- Basic TypeScript knowledge
- SMRT framework and content module installed
- OpenAI API key (or another supported AI provider)

## Project Setup

Create a new project:

```bash
mkdir content-research-agent
cd content-research-agent
bun init -y
bun add @have/smrt @have/spider @have/files
```

Install the SMRT content module (from the monorepo):

```bash
# Add the real content processing module
bun add ../../smrt/content
```

Create your environment configuration:

```bash
# .env
OPENAI_API_KEY=sk-...
```

## Step 1: Use the Real Content Model

Instead of creating custom models, we'll use the production-ready `Content` class from `@have/content`. Create `src/research-service.ts`:

```typescript
import { Content, Contents } from '@have/content';
import { getAIClient } from '@have/ai';
import { WebScraperTool } from '@have/spider';

/**
 * Research Service using real SMRT Content module
 * Demonstrates AI-powered content processing and analysis
 */
export class ResearchService {
  private ai: any;
  private scraper: WebScraperTool;
  private contents: Contents;

  constructor() {
    this.ai = null; // Will be initialized async
    this.scraper = new WebScraperTool();
    this.contents = new Contents({}); // Content collection manager
  }

  async initialize() {
    this.ai = await getAIClient({ provider: 'openai' });
  }

  /**
   * Extract and process content from a URL using real Content class
   */
  async extractContentFromURL(url: string, topic?: string): Promise<Content> {
    // Extract raw content from URL
    const rawContent = await this.scraper.extractContent(url);

    // Create Content instance with real SMRT Content class
    const content = new Content({
      url: url,
      source: 'web_scraping',
      body: rawContent.text,
      title: rawContent.title || '',
      type: 'research_source',
      status: 'published',
      state: 'active',
      ai: this.ai // Enable AI capabilities
    });

    // Use Content's built-in AI capabilities for analysis
    if (topic) {
      // AI-powered relevance check using Content.is() method
      const isRelevant = await content.is(`relevant to the topic: ${topic}`);
      if (!isRelevant) {
        content.state = 'deprecated';
      }
    }

    // AI-powered categorization using Content.do() method
    const category = await content.do(
      `Categorize this content into one of: research, news, documentation, reference, opinion`
    );
    content.type = category;

    // Generate AI summary
    const summary = await content.do(
      `Create a 2-sentence summary focusing on key facts and insights`
    );
    content.description = summary;

    // Save to database
    await content.save();
    return content;
  }

  /**
   * Analyze multiple content pieces for a research topic
   */
  async analyzeContentCollection(topic: string): Promise<Content> {
    // Get all content related to the topic
    const relatedContent = await this.contents.list({
      where: {
        'body LIKE': `%${topic}%`,
        status: 'published',
        state: 'active'
      }
    });

    // Create a synthesis content piece
    const synthesis = new Content({
      title: `Research Synthesis: ${topic}`,
      type: 'synthesis',
      source: 'analysis',
      status: 'draft',
      ai: this.ai
    });

    // AI-powered synthesis of multiple sources
    const combinedText = relatedContent.map(c => c.body).join('\n\n---\n\n');

    const analysis = await synthesis.do(`
      Analyze these research sources about "${topic}" and create a comprehensive synthesis:

      ${combinedText}

      Include:
      1. Key themes and patterns
      2. Conflicting viewpoints
      3. Evidence quality assessment
      4. Research gaps identified
      5. Actionable insights
    `);

    synthesis.body = analysis;

    // Add references to source content
    for (const source of relatedContent) {
      await synthesis.addReference(source);
    }

    await synthesis.save();
    return synthesis;
  }

  /**
   * Generate a research report from content collection
   */
  async generateResearchReport(topic: string): Promise<string> {
    const synthesis = await this.analyzeContentCollection(topic);

    return await synthesis.do(`
      Create a professional research report based on this synthesis.
      Format with:
      - Executive Summary
      - Methodology
      - Key Findings
      - Analysis & Insights
      - Recommendations
      - References

      Topic: ${topic}
      Synthesis: ${synthesis.body}
    `);
  }
}
```

## Step 2: Using the Research Service

Create `src/main.ts` to demonstrate the research capabilities:

```typescript
import { ResearchService } from './research-service';
import { initializeDatabase } from '@have/smrt';

async function main() {
  // Initialize database and research service
  await initializeDatabase();
  const research = new ResearchService();
  await research.initialize();

  console.log('🔬 Starting AI-powered research...\n');

  // Example 1: Extract and analyze content from URLs
  console.log('📥 Extracting content from sources...');

  const sources = [
    'https://example.com/ai-trends-2024',
    'https://example.com/machine-learning-breakthroughs',
    'https://example.com/future-of-ai'
  ];

  for (const url of sources) {
    try {
      const content = await research.extractContentFromURL(url, 'artificial intelligence');
      console.log(`✅ Processed: ${content.title}`);
      console.log(`   Category: ${content.type}`);
      console.log(`   Summary: ${content.description}\n`);
    } catch (error) {
      console.log(`❌ Failed to process ${url}: ${error.message}\n`);
    }
  }

  // Example 2: Generate research synthesis
  console.log('🧠 Generating research synthesis...');
  const synthesis = await research.analyzeContentCollection('artificial intelligence');
  console.log(`✅ Created synthesis: ${synthesis.title}`);
  console.log(`   Content length: ${synthesis.body.length} characters\n`);

  // Example 3: Generate final research report
  console.log('📊 Generating final research report...');
  const report = await research.generateResearchReport('artificial intelligence');
  console.log('✅ Research report generated!\n');
  console.log('--- RESEARCH REPORT ---');
  console.log(report);
}

main().catch(console.error);
```

## Step 3: Advanced Content Analysis

The real `Content` class provides powerful AI capabilities. Here are some advanced examples:

```typescript
// Create a content analysis script
import { Content } from '@have/content';

async function analyzeContent() {
  const content = new Content({
    title: 'AI Research Paper',
    body: 'Large language models have shown remarkable capabilities...',
    type: 'research',
    ai: await getAIClient({ provider: 'openai' })
  });

  // Use Content's built-in AI methods
  console.log('🤖 AI Analysis Results:\n');

  // Check characteristics
  const isAcademic = await content.is('written in academic style');
  const isBiased = await content.is('showing clear bias or opinion');
  const isRecent = await content.is('discussing recent developments (2023-2024)');

  console.log(`Academic style: ${isAcademic}`);
  console.log(`Shows bias: ${isBiased}`);
  console.log(`Recent content: ${isRecent}\n`);

  // Extract information
  const keyTerms = await content.do('Extract the 5 most important technical terms as JSON array');
  const methodology = await content.do('Identify the research methodology used');
  const limitations = await content.do('List any limitations or gaps mentioned');

  console.log(`Key terms: ${keyTerms}`);
  console.log(`Methodology: ${methodology}`);
  console.log(`Limitations: ${limitations}\n`);

  // Generate derivatives
  const abstract = await content.do('Create a 100-word abstract');
  const citations = await content.do('Generate 3 follow-up research questions');

  console.log(`Abstract: ${abstract}`);
  console.log(`Follow-up questions: ${citations}`);
}
```

## Key Features Demonstrated

### 🎯 **Real SMRT Content Module**
- Uses production `Content` and `Contents` classes
- Built-in AI capabilities (`do()`, `is()` methods)
- Automatic database persistence
- Content reference management

### 🤖 **AI-Powered Analysis**
- Automatic content categorization
- Relevance assessment
- Multi-source synthesis
- Report generation

### 🔗 **Content Relationships**
- Reference linking between content pieces
- Collection-based querying
- Hierarchical content organization

### 📊 **Professional Features**
- Content status and state management
- Publication workflow support
- Metadata and tagging
- Full audit trail

## Next Steps

<div className="row">
  <div className="col col--4">
    <div className="feature-card">
      <h3>🎯 Triple-Purpose Apps</h3>
      <p>Learn how to build services that work as standalone apps, federated modules, and NPM packages</p>
      <a href="/docs/tutorials/triple-purpose-architecture" className="nav-pill">Build Triple-Purpose Apps →</a>
    </div>
  </div>
  <div className="col col--4">
    <div className="feature-card">
      <h3>📚 Content Module</h3>
      <p>Explore the full capabilities of the SMRT Content module</p>
      <a href="/docs/supporting-libraries/content" className="nav-pill">Content Documentation →</a>
    </div>
  </div>
  <div className="col col--4">
    <div className="feature-card">
      <h3>🔧 Advanced Patterns</h3>
      <p>Master complex SMRT patterns and integrations</p>
      <a href="/docs/smrt-framework/advanced-patterns" className="nav-pill">Advanced Guide →</a>
    </div>
  </div>
</div>

---

<div className="callout success">
  <strong>🎉 Success!</strong> You've built a professional research agent using real SMRT modules. The Content class provides enterprise-grade AI-powered content processing capabilities.
</div>
