import { test, expect } from '@playwright/test';

test('browser launches and basic functionality works', async ({ page }) => {
  // Test with a simple data URL to avoid network issues
  await page.goto('data:text/html,<html><head><title>Test Page</title></head><body><h1>Hello World</h1></body></html>');
  
  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle('Test Page');
  
  // Expect page to contain heading
  await expect(page.locator('h1')).toContainText('Hello World');
});