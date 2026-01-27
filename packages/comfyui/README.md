---
id: comfyui
title: "@happyvertical/comfyui: ComfyUI API Client"
sidebar_label: "@happyvertical/comfyui"
sidebar_position: 10
---

# @happyvertical/comfyui

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A WebSocket-based client for ComfyUI workflow orchestration and video generation in the HAVE SDK.

## Overview

The `@happyvertical/comfyui` package provides a TypeScript client for interacting with ComfyUI servers via WebSocket. It supports workflow execution, progress monitoring, and output downloading for AI-powered image and video generation pipelines.

## Features

- **WebSocket Connection**: Real-time communication with ComfyUI servers
- **Workflow Execution**: Queue and execute ComfyUI workflows
- **Progress Monitoring**: Track execution progress with detailed events
- **Parameter Injection**: Dynamically inject values into workflow nodes
- **Output Download**: Retrieve generated images and videos
- **Queue Management**: Monitor and manage the execution queue
- **System Stats**: Query server status and capabilities
- **File Upload**: Upload images and other files for workflow inputs

## Installation

```bash
# Install with bun (recommended)
bun add @happyvertical/comfyui

# Or with npm
npm install @happyvertical/comfyui

# Or with pnpm
pnpm add @happyvertical/comfyui
```

## Quick Start

### Basic Usage

```typescript
import { ComfyUIClient, injectWorkflowParams } from '@happyvertical/comfyui';

// Create client
const client = new ComfyUIClient({
  url: 'http://localhost:8188',
});

// Connect to server
await client.connect();

// Load and modify workflow
const workflow = JSON.parse(fs.readFileSync('workflow.json', 'utf-8'));
const modifiedWorkflow = injectWorkflowParams(
  workflow,
  {
    seedImage: '3',
    prompt: '6',
  },
  {
    seedImage: 'input/anchor.png',
    prompt: 'professional news anchor speaking',
  }
);

// Queue prompt and wait for completion
const result = await client.queuePrompt(modifiedWorkflow);
const history = await client.waitForCompletion(result.promptId);

// Download output
const output = history.outputs['SaveVideo'];
if (output?.videos?.[0]) {
  const video = await client.downloadOutput(output.videos[0].filename);
  fs.writeFileSync('output.mp4', video);
}

await client.disconnect();
```

### Progress Tracking

```typescript
const history = await client.waitForCompletion(promptId, {
  onProgress: (event) => {
    switch (event.type) {
      case 'progress':
        console.log(`Progress: ${event.value}/${event.max}`);
        break;
      case 'executing':
        console.log(`Executing node: ${event.node}`);
        break;
      case 'execution_cached':
        console.log(`Cached nodes: ${event.nodes.join(', ')}`);
        break;
    }
  },
});
```

### File Upload

```typescript
// Upload image for workflow input
const imageBuffer = fs.readFileSync('input.png');
const uploadResult = await client.uploadImage(imageBuffer, 'input.png');

console.log(`Uploaded: ${uploadResult.name}`);
```

### System Status

```typescript
// Get system stats
const stats = await client.getSystemStats();
console.log(`Queue: ${stats.queue.running}/${stats.queue.pending}`);

// Get queue status
const queue = await client.getQueueStatus();
console.log(`Running: ${queue.running.length}, Pending: ${queue.pending.length}`);
```

## API Reference

### ComfyUIClient

The main client class for interacting with ComfyUI servers.

#### Constructor

```typescript
new ComfyUIClient(options: ComfyUIClientOptions)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | - | ComfyUI server URL (e.g., `http://localhost:8188`) |
| `clientId` | `string` | auto-generated | Unique client identifier |
| `timeout` | `number` | `600000` | Request timeout in milliseconds |

#### Methods

| Method | Description |
|--------|-------------|
| `connect()` | Establish WebSocket connection |
| `disconnect()` | Close WebSocket connection |
| `queuePrompt(workflow)` | Queue a workflow for execution |
| `waitForCompletion(promptId, options?)` | Wait for prompt completion with progress tracking |
| `getHistory(promptId)` | Get execution history for a prompt |
| `getQueueStatus()` | Get current queue status |
| `getSystemStats()` | Get server system statistics |
| `uploadImage(buffer, filename, options?)` | Upload an image file |
| `downloadOutput(filename, subfolder?, type?)` | Download a generated output file |
| `interruptExecution()` | Interrupt the current execution |
| `clearQueue()` | Clear all pending queue items |

### injectWorkflowParams

Utility function to inject dynamic values into workflow nodes.

```typescript
function injectWorkflowParams(
  workflow: ComfyWorkflow,
  nodeMapping: NodeMapping,
  values: Record<string, unknown>
): ComfyWorkflow
```

#### Parameters

- `workflow` - The ComfyUI workflow JSON
- `nodeMapping` - Maps parameter names to node IDs (e.g., `{ seedImage: '3' }`)
- `values` - Values to inject (e.g., `{ seedImage: 'path/to/image.png' }`)

## Types

```typescript
interface ComfyUIClientOptions {
  url: string;
  clientId?: string;
  timeout?: number;
}

interface PromptResult {
  promptId: string;
  number: number;
  nodeErrors?: Record<string, unknown>;
}

interface HistoryEntry {
  promptId: string;
  outputs: Record<string, NodeOutput>;
  status: { completed: boolean; messages?: unknown[] };
}

interface ProgressEvent {
  type: 'progress' | 'executing' | 'executed' | 'execution_cached' | 'execution_error';
  promptId?: string;
  node?: string;
  value?: number;
  max?: number;
  nodes?: string[];
}
```

## Use Cases

### AI Video Generation Pipeline

```typescript
import { ComfyUIClient, injectWorkflowParams } from '@happyvertical/comfyui';

async function generateVideo(seedImage: string, audioFile: string) {
  const client = new ComfyUIClient({ url: 'http://localhost:8188' });
  await client.connect();

  try {
    // Upload inputs
    await client.uploadImage(fs.readFileSync(seedImage), 'seed.png');
    await client.uploadImage(fs.readFileSync(audioFile), 'audio.wav');

    // Load lip-sync workflow
    const workflow = JSON.parse(fs.readFileSync('lipsync-workflow.json', 'utf-8'));
    const modified = injectWorkflowParams(workflow, {
      seedImage: '3',
      audioFile: '5',
    }, {
      seedImage: 'input/seed.png',
      audioFile: 'input/audio.wav',
    });

    // Execute with progress
    const result = await client.queuePrompt(modified);
    const history = await client.waitForCompletion(result.promptId, {
      onProgress: (e) => {
        if (e.type === 'progress') {
          console.log(`Rendering: ${Math.round((e.value! / e.max!) * 100)}%`);
        }
      },
    });

    // Download output
    const output = history.outputs['SaveVideo'];
    return await client.downloadOutput(output.videos[0].filename);
  } finally {
    await client.disconnect();
  }
}
```

### Batch Image Generation

```typescript
async function generateBatch(prompts: string[]) {
  const client = new ComfyUIClient({ url: 'http://localhost:8188' });
  await client.connect();

  const results = [];
  for (const prompt of prompts) {
    const workflow = injectWorkflowParams(baseWorkflow, { prompt: '6' }, { prompt });
    const result = await client.queuePrompt(workflow);
    const history = await client.waitForCompletion(result.promptId);
    results.push(history);
  }

  await client.disconnect();
  return results;
}
```

## Requirements

- ComfyUI server running and accessible
- Node.js 20+ or Bun
- WebSocket support in runtime

## License

This package is part of the HAVE SDK and is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.
