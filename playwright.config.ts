import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Environment detection
const isDevContainer = () => {
  return !!(
    process.env.DEVCONTAINER ||
    process.env.CODESPACES ||
    process.env.REMOTE_CONTAINERS ||
    existsSync('/.dockerenv')
  );
};

const isCI = () => {
  return !!(
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.GITLAB_CI
  );
};

// Smart browser detection
const getBrowserConfig = () => {
  const inContainer = isDevContainer();
  const inCI = isCI();

  // Force headless mode in containers or CI
  const headless =
    inContainer || inCI || process.env.PLAYWRIGHT_HEADLESS === 'true';

  console.log('🎭 Playwright environment detected:');
  console.log(`   Container: ${inContainer}`);
  console.log(`   CI: ${inCI}`);
  console.log(`   Headless: ${headless}`);

  // Try to find system browsers for local development
  const findSystemBrowser = (browserName: string): string | undefined => {
    if (inContainer) return undefined; // Don't look for system browsers in containers

    const commands = {
      chromium: [
        'which chromium',
        'which chromium-browser',
        'which google-chrome',
        'which chrome',
      ],
      firefox: ['which firefox'],
      safari: ['which safari'],
    };

    const browserCommands =
      commands[browserName as keyof typeof commands] || [];

    for (const cmd of browserCommands) {
      try {
        const path = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' }).trim();
        if (path) {
          console.log(`   Found system ${browserName}: ${path}`);
          return path;
        }
      } catch {
        // Continue trying other commands
      }
    }

    console.log(
      `   No system ${browserName} found, using Playwright's installed browser`,
    );
    return undefined;
  };

  return {
    headless,
    systemChromium: findSystemBrowser('chromium'),
    systemFirefox: findSystemBrowser('firefox'),
  };
};

const browserConfig = getBrowserConfig();

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e-tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI ? 'github' : 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    // baseURL: 'http://127.0.0.1:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Force headless mode in containers/CI */
    headless: browserConfig.headless,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: browserConfig.systemChromium ? undefined : 'chromium',
        launchOptions: browserConfig.systemChromium
          ? {
              executablePath: browserConfig.systemChromium,
              headless: browserConfig.headless,
            }
          : {
              headless: browserConfig.headless,
            },
      },
    },

    // Firefox project - enable when needed
    // {
    //   name: 'firefox',
    //   use: {
    //     ...devices['Desktop Firefox'],
    //     launchOptions: browserConfig.systemFirefox ? {
    //       executablePath: browserConfig.systemFirefox,
    //       headless: browserConfig.headless,
    //     } : {
    //       headless: browserConfig.headless,
    //     }
    //   },
    // },

    // WebKit project - only works with Playwright's installed browser
    // {
    //   name: 'webkit',
    //   use: {
    //     ...devices['Desktop Safari'],
    //     launchOptions: {
    //       headless: browserConfig.headless,
    //     }
    //   },
    // },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://127.0.0.1:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
