---
id: index
title: Welcome to the Happy Vertical SDK
sidebar_label: Introduction
sidebar_position: 1
slug: /
---

# Welcome to the Happy Vertical SDK

<div className="hero hero--primary">
  <div className="container">
    <h1 className="hero__title">Happy Vertical SDK</h1>
    <p className="hero__subtitle">Build powerful, vertical AI agents in TypeScript</p>
  </div>
</div>

## **The Happy Vertical SDK is a modern toolkit for building powerful, vertical AI agents in TypeScript.**

Built around the **SMRT Agent Framework**, the Happy Vertical SDK provides the **structure**, **memory**, and **perception** needed for agents to perform complex tasks. The SMRT framework serves as the central orchestrator that brings together AI capabilities, persistent storage, and external integrations into a cohesive, production-ready system.

## 30-Second Example

See how easy it is to create a production-ready service with SMRT's auto-generation:

```typescript
import { BaseObject, smrt } from '@have/smrt';

// Define your data model - that's it!
@smrt()
export class Product extends BaseObject {
  name: string = '';
  description: string = '';
  category: string = '';
  manufacturer: string = '';
  specifications: Record<string, any> = {};
  tags: string[] = [];

  async getSpecification(key: string): Promise<any> {
    return this.specifications[key];
  }

  // AI-powered method from BaseObject
  async summarize(): Promise<string> {
    return await this.do(`Summarize this product: ${this.name} - ${this.description}`);
  }
}
```

That's it! This single `@smrt()` decorator automatically generates everything you need:
- **REST API endpoints** (`GET /products`, `POST /products`, `PUT /products/:id`, `DELETE /products/:id`)
- **AI tools for agents** (list, get, create, update, search operations)
- **CLI commands** (`product list`, `product create`, `product update`, `product delete`)
- **TypeScript client library** (type-safe API calls)
- **MCP server integration** (for AI agent tools)
- **Database schema and migrations** (automatic table creation)

All with full TypeScript type safety and zero boilerplate!

## Core Philosophy

The Happy Vertical SDK embraces three fundamental principles:

### 🏗️ **Structure**
Agents need a clear way to organize and model their world. SMRT provides `SmartObjects` and `Collections` that automatically handle persistence, validation, and relationships.

### 🧠 **Memory**
Agents must remember past interactions and build knowledge over time. SMRT integrates with databases seamlessly, giving agents both short-term working memory and long-term storage.

### 👁️ **Perception**
Agents need to interact with the world. SMRT provides tools and integrations that let agents read files, scrape websites, process documents, and more—all through a consistent interface.

## What Makes the Happy Vertical SDK Different?

### 🎯 **Triple-Purpose Architecture**
Build once, deploy everywhere. Every Happy Vertical SDK service can be consumed as:
- **Standalone Application**: Complete web app with UI (`npm run dev:standalone`)
- **Module Federation**: Runtime component sharing (`import ProductCard from 'productService/ProductCard'`)
- **NPM Package**: Traditional library imports (`import { Product } from '@have/products'`)

### 🤖 **AI-First Auto-Generation**
The `@smrt()` decorator automatically generates everything you need:
- **REST APIs**: Full CRUD endpoints with OpenAPI docs
- **MCP Tools**: AI agent integrations for Claude/GPT
- **TypeScript Clients**: Type-safe API clients
- **CLI Commands**: Admin interfaces
- **Database Schemas**: Automatic migrations

### ⚡ **Vite-Powered Development**
- **Virtual Modules**: Auto-generated code appears as imports (`@smrt/routes`, `@smrt/client`)
- **Hot Module Replacement**: Instant updates during development
- **Code Splitting**: Optimal bundles for each consumption pattern
- **Module Federation**: Runtime micro-frontend composition

### 🏗️ **Production-Ready Architecture**
- **Type Safety**: Full TypeScript throughout
- **Error Handling**: Automatic retries and resilience
- **Monitoring**: Built-in logging and observability
- **Scalability**: Horizontal scaling with micro-frontends

## Quick Links

<div className="row">
  <div className="col col--4">
    <div className="feature-card">
      <h3>🎯 Getting Started</h3>
      <p>Install SMRT and build your first agent in under 5 minutes.</p>
      <a href="/docs/getting-started/installation" className="nav-pill">Start Building →</a>
    </div>
  </div>
  <div className="col col--4">
    <div className="feature-card">
      <h3>📚 Core Concepts</h3>
      <p>Deep dive into the SMRT framework architecture and patterns.</p>
      <a href="/docs/smrt-framework/overview" className="nav-pill">Learn More →</a>
    </div>
  </div>
  <div className="col col--4">
    <div className="feature-card">
      <h3>🛠️ Tutorials</h3>
      <p>Build real-world agents with step-by-step project guides.</p>
      <a href="/docs/tutorials/build-research-agent" className="nav-pill">View Tutorials →</a>
    </div>
  </div>
</div>

## The Happy Vertical SDK Ecosystem

The Happy Vertical SDK is built around the SMRT framework, which orchestrates multiple specialized libraries:

```mermaid
graph TB
    SMRT[SMRT Framework]
    SMRT --> AI[@have/ai<br/>AI Providers]
    SMRT --> SQL[@have/sql<br/>Database]
    SMRT --> Files[@have/files<br/>File System]
    SMRT --> PDF[@have/pdf<br/>Documents]
    SMRT --> Spider[@have/spider<br/>Web Scraping]
    SMRT --> Utils[@have/utils<br/>Utilities]

    style SMRT fill:#3b82f6,stroke:#1e40af,stroke-width:3px,color:#fff
    style AI fill:#e5e7eb
    style SQL fill:#e5e7eb
    style Files fill:#e5e7eb
    style PDF fill:#e5e7eb
    style Spider fill:#e5e7eb
    style Utils fill:#e5e7eb
```

Each library provides specific capabilities that Happy Vertical SDK agents can leverage:

- **[@have/ai](/docs/supporting-libraries/ai)**: Multi-provider AI integration (OpenAI, Anthropic, Gemini, Bedrock)
- **[@have/sql](/docs/supporting-libraries/sql)**: Database operations for agent memory
- **[@have/files](/docs/supporting-libraries/files)**: File system access and manipulation
- **[@have/pdf](/docs/supporting-libraries/pdf)**: PDF processing and text extraction
- **[@have/spider](/docs/supporting-libraries/spider)**: Web content extraction
- **[@have/utils](/docs/supporting-libraries/utils)**: Common utilities and helpers

## Who Should Use the Happy Vertical SDK?

The Happy Vertical SDK is perfect for:

- **🚀 Startups** building AI-powered products quickly
- **🏢 Enterprises** needing reliable, scalable agent systems
- **👨‍💻 Developers** who want to focus on agent logic, not infrastructure
- **🔬 Researchers** prototyping new agent architectures
- **🎓 Students** learning about AI agent development

## Real-World Use Cases

Teams are using the Happy Vertical SDK to build:

- **Customer Support Agents** that understand context and resolve tickets
- **Research Assistants** that gather, analyze, and summarize information
- **Document Processors** that extract and transform data from PDFs
- **Content Generators** that create contextual, structured content
- **Workflow Automators** that orchestrate complex business processes
- **Data Analysts** that query databases and generate reports

## Ready to Build?

<div className="callout info">
  <h3>🚀 Start Your Agent Journey</h3>
  <p>Install the Happy Vertical SDK and create your first intelligent agent in minutes:</p>

  ```bash
  bun add @have/smrt
  ```

  <a href="/docs/getting-started/installation" className="button button--primary button--lg">
    Get Started →
  </a>
</div>

## Community & Support

- **GitHub**: [happyvertical/sdk](https://github.com/happyvertical/sdk)
- **Discord**: [Join our community](https://discord.gg/smrt-agents)
- **Twitter**: [@smrtframework](https://twitter.com/smrtframework)

---

*SMRT: Structure + Memory + Perception = Intelligence*