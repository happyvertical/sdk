/**
 * GitHub API Helper Functions
 */

import https from 'node:https';

export async function githubAPI(
  token: string,
  method: string,
  path: string,
  data: unknown = null,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'happyvertical-github-actions',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    };

    if (data) {
      options.headers = {
        ...options.headers,
        'Content-Type': 'application/json',
      };
    }

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body ? JSON.parse(body) : null);
        } else {
          reject(new Error(`GitHub API error: ${res.statusCode} ${body}`));
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}
