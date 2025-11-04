/**
 * GitHub REST API client
 */

import { RepositoryError } from '../errors.js';

export interface GitHubRestConfig {
  token: string;
  baseUrl?: string;
}

/**
 * GitHub REST API client
 */
export class GitHubRest {
  private token: string;
  private baseUrl: string;

  constructor(config: GitHubRestConfig) {
    this.token = config.token;
    this.baseUrl = config.baseUrl || 'https://api.github.com';
  }

  /**
   * Make a REST API request
   */
  async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw RepositoryError.fromHTTPStatus(
        response.status,
        `GitHub API error: ${response.statusText}\n${error}`,
        error,
      );
    }

    return response.json();
  }

  /**
   * GET request
   */
  async get(path: string): Promise<unknown> {
    return this.request('GET', path);
  }

  /**
   * POST request
   */
  async post(path: string, body: unknown): Promise<unknown> {
    return this.request('POST', path, body);
  }

  /**
   * PATCH request
   */
  async patch(path: string, body: unknown): Promise<unknown> {
    return this.request('PATCH', path, body);
  }

  /**
   * PUT request
   */
  async put(path: string, body?: unknown): Promise<unknown> {
    return this.request('PUT', path, body);
  }

  /**
   * DELETE request
   */
  async delete(path: string): Promise<void> {
    await this.request('DELETE', path);
  }
}
