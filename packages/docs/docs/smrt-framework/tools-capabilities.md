---
id: tools-capabilities
title: "Tools & Capabilities"
sidebar_label: "Tools & Capabilities"
sidebar_position: 5
---

# Tools & Capabilities

Built-in tools and extensible capability system for SMRT agents.

## Overview

SMRT agents come with a comprehensive toolkit:

- **📁 File Operations**: Read, write, search files
- **🗄️ Database Access**: Query and manipulate data
- **🕷️ Web Scraping**: Extract content from websites
- **📄 PDF Processing**: Parse and analyze documents
- **🤖 AI Integration**: Multi-provider AI access

## Built-in Tools

### File System Tools
```typescript
import { FilesTool } from '@have/files';

const files = new FilesTool();
await files.readFile('/path/to/file.txt');
await files.writeFile('/path/to/output.txt', content);
const found = await files.findFiles('**/*.md');
```

### Database Tools
```typescript
import { Database } from '@have/sql';

const db = Database.getInstance();
const results = await db.query('SELECT * FROM products WHERE price > ?', [100]);
```

### Web Scraping Tools
```typescript
import { WebScraperTool } from '@have/spider';

const scraper = new WebScraperTool();
const content = await scraper.extractContent('https://example.com');
```

### PDF Processing Tools
```typescript
import { PDFProcessor } from '@have/pdf';

const pdf = new PDFProcessor();
const text = await pdf.extractText('/path/to/document.pdf');
```

## Custom Tools

Create your own tools by extending the base Tool class:

```typescript
import { Tool } from '@have/smrt';

export class CustomTool extends Tool {
  name = 'custom_calculator';
  description = 'Performs custom calculations';

  async execute(params: { operation: string; values: number[] }) {
    // Tool implementation
    return this.calculate(params.operation, params.values);
  }
}
```

*Full documentation coming soon...*