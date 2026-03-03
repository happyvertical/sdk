# @happyvertical/comfyui

ComfyUI API client for workflow orchestration and video generation. Class: `new ComfyUIClient(options)`.

## Key patterns

- WebSocket connection for real-time progress monitoring via `onProgress(promptId, handler)`
- REST API for workflow queuing, file upload/download, queue management
- `injectWorkflowParams(workflow, mapping, values)` helper to inject dynamic params into workflow JSON
- `waitForCompletion()` combines WebSocket events with HTTP polling fallback
- Auto-reconnect with configurable attempts and delay

## Gotchas

- Not adapter/factory pattern — uses `ComfyUIClient` class directly
- Default timeout is 600s (10 minutes) for long-running workflows
- `waitForCompletion` detects finish when `executed` event has `nodeId === null`
- WebSocket URL is derived from HTTP URL (http→ws, https→wss)
- HTTP Basic auth supported via `username`/`password` options
- Upload endpoint is `/upload/image` regardless of file type (videos too)
