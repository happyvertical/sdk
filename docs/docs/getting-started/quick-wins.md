---
id: quick-wins
title: Quick Wins with SMRT
sidebar_label: Quick Wins
sidebar_position: 3
---

# Quick Wins with SMRT

Get immediate value from SMRT with these ready-to-use patterns and recipes. Copy, paste, and customize to your needs.

## 5-Minute Wins

### 1. Instant Q&A Agent

```typescript
import { Agent } from '@have/smrt';
import { getAIClient } from '@have/ai';

const qa = new Agent({
  ai: await getAIClient({ provider: 'openai' }),
  name: 'QuickQA'
});

// Ask anything
const answer = await qa.run({
  prompt: "Explain quantum computing in simple terms"
});

console.log(answer);
```

### 2. File Analyzer

```typescript
import { Agent, SmartObject } from '@have/smrt';
import { Files } from '@have/files';

class FileAnalysis extends SmartObject {
  filename: string = '';
  summary: string = '';
  keyPoints: string[] = [];
}

const analyzer = new Agent({
  ai: await getAIClient({ provider: 'openai' }),
  tools: [Files]
});

const result = await analyzer.run({
  prompt: "Analyze all .md files in the docs folder",
  outputClass: FileAnalysis
});
```

### 3. Database Query Assistant

```typescript
import { Agent } from '@have/smrt';
import { SQL } from '@have/sql';

const dbAgent = new Agent({
  ai: await getAIClient({ provider: 'openai' }),
  tools: [SQL]
});

const results = await dbAgent.run({
  prompt: "Find all users who signed up last month and have made a purchase"
});
```

## Copy-Paste Templates

### Research Agent Template

```typescript
import { Agent, SmartObject, Collection } from '@have/smrt';
import { Spider } from '@have/spider';

class ResearchNote extends SmartObject {
  topic: string = '';
  sources: string[] = [];
  summary: string = '';
  keyFindings: string[] = [];

  async generateReport(): Promise<string> {
    return await this.do(`
      Create a formatted report from this research:
      Topic: ${this.topic}
      Summary: ${this.summary}
      Key Findings: ${this.keyFindings.join(', ')}

      Format as a professional research document.
    `);
  }
}

class ResearchAgent extends Agent {
  private notes: Collection<ResearchNote>;

  constructor() {
    super({
      ai: await getAIClient({ provider: 'openai' }),
      tools: [Spider],
      name: 'Researcher'
    });

    this.notes = new Collection<ResearchNote>({
      itemClass: ResearchNote,
      ai: this.ai
    });
  }

  async research(topic: string, urls: string[]): Promise<ResearchNote> {
    const spider = new Spider();
    const contents = await Promise.all(
      urls.map(url => spider.extractContent(url))
    );

    const note = new ResearchNote({
      topic,
      sources: urls,
      ai: this.ai
    });

    note.summary = await this.ai.message(`
      Summarize these sources about ${topic}:
      ${contents.join('\n\n')}
    `);

    note.keyFindings = JSON.parse(await this.ai.message(`
      Extract 5 key findings from this research.
      Return as JSON array of strings.
    `));

    await note.save();
    return note;
  }
}

// Use it
const researcher = new ResearchAgent();
const research = await researcher.research(
  "AI Safety",
  [
    "https://example.com/ai-safety-intro",
    "https://example.com/ai-risks"
  ]
);

const report = await research.generateReport();
console.log(report);
```

### Task Automation Agent

```typescript
import { Agent, SmartObject, Collection } from '@have/smrt';

class Task extends SmartObject {
  title: string = '';
  description: string = '';
  status: 'todo' | 'in-progress' | 'done' = 'todo';
  assignee?: string;
  dueDate?: Date;
  dependencies: string[] = [];

  async start() {
    this.status = 'in-progress';
    await this.save();
  }

  async complete() {
    this.status = 'done';
    await this.save();
  }

  async isBlocked(): Promise<boolean> {
    if (!this.dependencies.length) return false;

    const tasks = new Collection<Task>({ itemClass: Task });
    const deps = await Promise.all(
      this.dependencies.map(id => tasks.get(id))
    );

    return deps.some(dep => dep?.status !== 'done');
  }
}

class TaskAgent extends Agent {
  private tasks: Collection<Task>;

  async createProject(description: string): Promise<Task[]> {
    // Use AI to break down the project
    const breakdown = await this.ai.message(`
      Break down this project into tasks:
      ${description}

      Return as JSON array with:
      - title
      - description
      - dependencies (array of task titles that must complete first)
      - estimatedHours
    `);

    const taskData = JSON.parse(breakdown);
    const createdTasks: Task[] = [];

    for (const data of taskData) {
      const task = new Task({
        ...data,
        ai: this.ai
      });
      await task.save();
      createdTasks.push(task);
    }

    return createdTasks;
  }

  async getNextTask(assignee: string): Promise<Task | null> {
    const available = await this.tasks.list({
      where: {
        status: 'todo',
        assignee: null
      }
    });

    for (const task of available) {
      const blocked = await task.isBlocked();
      if (!blocked) {
        task.assignee = assignee;
        task.status = 'in-progress';
        await task.save();
        return task;
      }
    }

    return null;
  }
}
```

### Content Generation Pipeline

```typescript
import { Agent, SmartObject } from '@have/smrt';

class Content extends SmartObject {
  type: 'blog' | 'social' | 'email' = 'blog';
  topic: string = '';
  tone: string = 'professional';
  content: string = '';
  metadata: Record<string, any> = {};

  async optimize(): Promise<void> {
    this.content = await this.do(`
      Optimize this content for ${this.type}:
      - Improve clarity and engagement
      - Ensure appropriate tone (${this.tone})
      - Add relevant formatting

      Content: ${this.content}
    `);
    await this.save();
  }

  async translate(language: string): Promise<Content> {
    const translated = new Content({
      ...this,
      content: await this.do(`Translate to ${language}: ${this.content}`),
      metadata: { ...this.metadata, language }
    });
    await translated.save();
    return translated;
  }
}

class ContentAgent extends Agent {
  async generateContent(
    type: Content['type'],
    topic: string,
    instructions?: string
  ): Promise<Content> {
    const content = new Content({
      type,
      topic,
      ai: this.ai
    });

    content.content = await this.ai.message(`
      Create ${type} content about: ${topic}
      ${instructions || ''}

      Requirements:
      - Engaging and informative
      - Appropriate for the medium
      - Include relevant examples
    `);

    await content.save();
    await content.optimize();

    return content;
  }

  async generateSeries(
    topic: string,
    count: number = 5
  ): Promise<Content[]> {
    const ideas = await this.ai.message(`
      Generate ${count} content ideas about ${topic}.
      Return as JSON array with title and angle for each.
    `);

    const ideaList = JSON.parse(ideas);

    return Promise.all(
      ideaList.map((idea: any) =>
        this.generateContent('blog', topic, idea.angle)
      )
    );
  }
}
```

## One-Liners

Quick SMRT operations for common tasks:

```typescript
// Smart search in any collection
const results = await collection.list({
  where: await ai.message(`Convert "${userQuery}" to database filters`)
});

// Auto-categorize any object
object.category = await object.do("Categorize this based on its content");

// Validate data quality
const isValid = await object.is("complete and high quality");

// Generate summary
const summary = await object.do("Summarize in 2 sentences");

// Extract structured data
const data = JSON.parse(
  await ai.message(`Extract fields from: ${text}`)
);

// Batch process with AI
const processed = await Promise.all(
  items.map(item => item.do("Process this"))
);
```

## Instant Generators

### Generate a REST API

```bash
npx @have/smrt generate:api --model Task --output ./api
```

This creates:
- Full CRUD endpoints
- OpenAPI documentation
- Input validation
- Error handling

### Generate a CLI Tool

```bash
npx @have/smrt generate:cli --model Task --output ./cli
```

This creates:
- Command-line interface
- CRUD commands
- Search functionality
- Bulk operations

### Generate MCP Tools

```bash
npx @have/smrt generate:mcp --model Task --output ./mcp
```

This creates:
- Model Context Protocol server
- AI tool definitions
- Claude Desktop integration

## Production-Ready Patterns

### Error Handling

```typescript
class RobustAgent extends Agent {
  async safeRun(prompt: string): Promise<any> {
    try {
      return await this.run({
        prompt,
        retries: 3,
        timeout: 30000
      });
    } catch (error) {
      // Log to your monitoring service
      console.error('Agent error:', error);

      // Fallback response
      return {
        success: false,
        error: error.message,
        fallback: true
      };
    }
  }
}
```

### Caching

```typescript
class CachedAgent extends Agent {
  private cache = new Map<string, any>();

  async cachedRun(prompt: string): Promise<any> {
    const key = prompt.toLowerCase().trim();

    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    const result = await this.run({ prompt });
    this.cache.set(key, result);

    // Clear cache after 1 hour
    setTimeout(() => this.cache.delete(key), 3600000);

    return result;
  }
}
```

### Rate Limiting

```typescript
class RateLimitedAgent extends Agent {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;

  async queuedRun(prompt: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await this.run({ prompt });
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      await task();

      // Rate limit: 1 request per second
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.processing = false;
  }
}
```

## Next Steps

Now that you've seen what's possible, dive deeper:

- [Explore the Framework →](/docs/smrt-framework/overview)
- [Build Complete Projects →](/docs/tutorials/build-research-agent)
- [Add More Capabilities →](/docs/smrt-framework/tools-capabilities)

---

<div className="callout success">
  <strong>🚀 Pro Tip:</strong> Start with these templates and customize them for your specific use case. The SMRT framework handles the complexity so you can focus on your agent's unique logic.
</div>