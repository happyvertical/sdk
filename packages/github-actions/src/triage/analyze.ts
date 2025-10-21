/**
 * GitHub Models AI Analysis
 */

import https from 'node:https';
import type { AIAnalysis, TriageContext } from './types.js';

const VALID_TYPES = [
  'bug',
  'feature',
  'enhancement',
  'tech-debt',
  'epic',
  'documentation',
  'question',
] as const;
const VALID_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
const VALID_URGENCIES = ['urgent', 'normal'] as const;

function validateAIAnalysis(parsed: unknown): AIAnalysis {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('AI response is not a valid object');
  }

  const response = parsed as Record<string, unknown>;

  // Validate required fields exist
  if (!response.type || typeof response.type !== 'string') {
    throw new Error('AI response missing required field: type');
  }
  if (!response.priority || typeof response.priority !== 'string') {
    throw new Error('AI response missing required field: priority');
  }
  if (!response.urgency || typeof response.urgency !== 'string') {
    throw new Error('AI response missing required field: urgency');
  }
  if (!response.reasoning || typeof response.reasoning !== 'string') {
    throw new Error('AI response missing required field: reasoning');
  }

  // Validate enum values
  if (!VALID_TYPES.includes(response.type as never)) {
    throw new Error(`Invalid type: ${response.type}`);
  }
  if (!VALID_PRIORITIES.includes(response.priority as never)) {
    throw new Error(`Invalid priority: ${response.priority}`);
  }
  if (!VALID_URGENCIES.includes(response.urgency as never)) {
    throw new Error(`Invalid urgency: ${response.urgency}`);
  }

  // Validate optional affected_packages field
  if (response.affected_packages !== undefined) {
    if (!Array.isArray(response.affected_packages)) {
      throw new Error('affected_packages must be an array');
    }
    if (!response.affected_packages.every((pkg) => typeof pkg === 'string')) {
      throw new Error('affected_packages must contain only strings');
    }
  }

  return response as AIAnalysis;
}

export async function analyzeIssue(
  context: TriageContext,
): Promise<AIAnalysis> {
  const prompt = buildAnalysisPrompt(context);

  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      messages: [
        {
          role: 'system',
          content:
            'You are an expert GitHub issue triager. Analyze issues and provide structured triage information in JSON format.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: 'gpt-4o-mini',
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const options = {
      hostname: 'models.inference.ai.azure.com',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${context.token}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const response = JSON.parse(body);
            const content = response.choices[0].message.content;
            const parsed = JSON.parse(content);
            const validated = validateAIAnalysis(parsed);
            resolve(validated);
          } catch (error) {
            reject(
              new Error(
                `Failed to parse or validate AI response: ${error instanceof Error ? error.message : String(error)}`,
              ),
            );
          }
        } else {
          reject(
            new Error(
              `GitHub Models API error: ${res.statusCode || 'unknown'} ${body}`,
            ),
          );
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function buildAnalysisPrompt(context: TriageContext): string {
  const { config, issueNumber, issueTitle, issueBody, issueAuthor } = context;

  let prompt = `Analyze this GitHub issue and provide triage information.

Repository: ${context.owner}/${context.repo} (${config.repoDescription})

Issue #${issueNumber}
Title: ${issueTitle}
Body: ${issueBody || '(empty)'}
Author: ${issueAuthor}

Determine:
1. **type**: One of: bug, feature, enhancement, tech-debt, epic, documentation, question
2. **priority**: critical, high, medium, low
3. **urgency**: Should this go directly to "To Do" status? (only for security issues or critical bugs affecting production)`;

  if (config.packagePattern) {
    prompt += `
4. **affected_packages**: List of ${config.packagePattern} packages affected`;
    if (config.packageExamples && config.packageExamples.length > 0) {
      prompt += ` (e.g., ${JSON.stringify(config.packageExamples)})`;
    }
    prompt += `
5. **reasoning**: Brief explanation of your analysis (2-3 sentences)`;
  } else {
    prompt += `
4. **reasoning**: Brief explanation of your analysis (2-3 sentences)`;
  }

  prompt += `

Return JSON in this exact format:
{
  "type": "bug|feature|enhancement|tech-debt|epic|documentation|question",
  "priority": "critical|high|medium|low",
  "urgency": "urgent|normal",`;

  if (config.packagePattern) {
    prompt += `
  "affected_packages": ["package names"],`;
  }

  prompt += `
  "reasoning": "explanation here"
}`;

  return prompt;
}
