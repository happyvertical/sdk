# Claude-Specific Instructions for Spider Package Refactoring

## Goal

Refactor the `@happyvertical/spider` package to follow the standardized provider pattern used in other `@happyvertical` packages like `ai`, `sql`, and `files`. The refactored package should provide a `getSpider` factory function that returns a spider adapter based on the provided options.

## Detailed Steps

1.  **Create a `src/shared` directory** to hold the shared interfaces and factory function.

2.  **Create `src/shared/types.ts`** and define the following interfaces:
    *   `Page`: The standardized data structure for a web page (as defined in `SPEC.md`).
    *   `FetchOptions`: The options for a fetch operation (as defined in `SPEC.md`), including `cache` and `cacheExpiry`.
    *   `ISpiderAdapter`: The interface that all spider adapters must implement (as defined in `SPEC.md`).

3.  **Create `src/shared/factory.ts`** and implement the `getSpider` factory function:
    *   It should take a `SpiderAdapterOptions` type, which will be a union of options for each adapter.
    *   It should have a `switch` statement on `options.adapter` to dynamically import and return the correct adapter.
    *   Initially, it should support three adapters: `simple`, `dom`, and `crawlee`.

4.  **Create `src/adapters` directory** to hold the adapter implementations.

5.  **Create `src/adapters/simple.ts`**:
    *   This adapter will implement the `ISpiderAdapter` interface.
    *   The `fetch` method will use `@happyvertical/cache` to handle caching.
    *   If the content is not in the cache, it will use the `fetchText` function from `@happyvertical/files` to get the page content.
    *   It will then use `cheerio` to parse the HTML and extract the links, similar to the current `parseIndexSource` function.
    *   It should return a `Page` object.

6.  **Create `src/adapters/dom.ts`**:
    *   This adapter will also implement the `ISpiderAdapter` interface.
    *   The `fetch` method will use `@happyvertical/cache` to handle caching.
    *   If the content is not in the cache, it will use `happy-dom` to process the page, similar to the `cheap: false` path in the current `fetchPageSource` function.
    *   It will also use `cheerio` to extract links.
    *   It should return a `Page` object.

7.  **Create `src/adapters/crawlee.ts`**:
    *   This adapter will implement the `ISpiderAdapter` interface.
    *   The `fetch` method will use `@happyvertical/cache` to handle caching.
    *   If the content is not in the cache, it will use `crawlee` to launch a headless browser, navigate to the URL, and get the page content.
    *   It will then use `cheerio` to parse the HTML and extract the links.
    *   It should return a `Page` object.

8.  **Update `src/index.ts`**:
    *   Remove the existing `fetchPageSource`, `parseIndexSource`, `createWindow`, and `processHtml` functions.
    *   Export the `getSpider` function from `./shared/factory`.
    *   Export the types from `./shared/types`.

9.  **Update `src/index.spec.ts`**:
    *   Rewrite the tests to test the new `getSpider` factory and the `simple`, `dom`, and `crawlee` adapters.
    *   Ensure the tests cover caching functionality.
    *   Ensure the tests cover the same functionality as the old tests.

10. **Update `package.json`**:
    *   Ensure all necessary dependencies are listed (`@happyvertical/cache`, `@happyvertical/files`, `@happyvertical/utils`, `cheerio`, `happy-dom`, `crawlee`, `undici`).

## Code Style and Conventions

*   Follow the existing code style and conventions of the `@happyvertical` monorepo.
*   Use TypeScript and adhere to the `tsconfig.json` settings.
*   Write clear and concise code with JSDoc comments for all public APIs.
*   Ensure all new files have the appropriate license header.