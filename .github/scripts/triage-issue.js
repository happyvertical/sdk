#!/usr/bin/env node

/**
 * AI-Powered Issue Triage Script
 *
 * Uses GitHub Models API to analyze issues and perform automatic triage:
 * - Apply type labels (type:bug, type:feature, etc.)
 * - Check for duplicates
 * - Assess priority and urgency
 * - Post triage comment with AI analysis
 * - Route critical issues to "To Do" status
 */

const https = require('node:https');

// Environment variables
const {
  GITHUB_TOKEN,
  ISSUE_NUMBER,
  ISSUE_TITLE,
  ISSUE_BODY,
  ISSUE_AUTHOR,
  REPOSITORY,
} = process.env;

// Validate required env vars
if (!GITHUB_TOKEN || !ISSUE_NUMBER || !REPOSITORY) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const [owner, repo] = REPOSITORY.split('/');

// GitHub API helper
async function githubAPI(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'happyvertical-sdk-triage',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    };

    if (data) {
      options.headers['Content-Type'] = 'application/json';
    }

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
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

// GitHub Models API helper
async function callGitHubModels(prompt) {
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
      model: 'gpt-4o-mini', // Fast and cost-effective
      temperature: 0.3, // Lower temperature for more consistent results
      response_format: { type: 'json_object' },
    });

    const options = {
      hostname: 'models.inference.ai.azure.com',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const response = JSON.parse(body);
          const content = response.choices[0].message.content;
          resolve(JSON.parse(content));
        } else {
          reject(
            new Error(`GitHub Models API error: ${res.statusCode} ${body}`),
          );
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Search for duplicate issues
async function searchDuplicates(title, _body) {
  const keywords = title.split(' ').slice(0, 5).join(' ');
  const query = `repo:${REPOSITORY} is:issue ${keywords}`;
  const path = `/search/issues?q=${encodeURIComponent(query)}&per_page=5`;

  try {
    const result = await githubAPI('GET', path);
    // Exclude the current issue from results
    return result.items.filter(
      (issue) => issue.number !== parseInt(ISSUE_NUMBER, 10),
    );
  } catch (error) {
    console.error('Error searching for duplicates:', error.message);
    return [];
  }
}

// Apply labels to issue
async function applyLabels(labels) {
  const path = `/repos/${owner}/${repo}/issues/${ISSUE_NUMBER}/labels`;
  try {
    await githubAPI('POST', path, { labels });
    console.log(`Applied labels: ${labels.join(', ')}`);
  } catch (error) {
    console.error('Error applying labels:', error.message);
  }
}

// Post triage comment
async function postComment(comment) {
  const path = `/repos/${owner}/${repo}/issues/${ISSUE_NUMBER}/comments`;
  try {
    await githubAPI('POST', path, { body: comment });
    console.log('Posted triage comment');
  } catch (error) {
    console.error('Error posting comment:', error.message);
  }
}

// Update project board status
async function updateProjectStatus(statusName) {
  // Project-specific IDs (from earlier gh CLI queries)
  const PROJECT_ID = 'PVT_kwDOB9Y8ns4A8-TY';
  const STATUS_FIELD_ID = 'PVTSSF_lADOB9Y8ns4A8-TYzgw0GaY';
  const STATUS_OPTIONS = {
    'To Do': 'c0c9ab27',
    'In Progress': 'ce670088',
    'Review & Testing': 'ee1f96bd',
  };

  const query = `
    query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $number) {
          projectItems(first: 10) {
            nodes {
              id
            }
          }
        }
      }
    }
  `;

  try {
    // Get project item ID
    const variables = { owner, repo, number: parseInt(ISSUE_NUMBER, 10) };
    const result = await githubAPI('POST', '/graphql', { query, variables });
    const itemId = result.data.repository.issue.projectItems.nodes[0]?.id;

    if (!itemId) {
      console.log('Issue not in project board, skipping status update');
      return;
    }

    // Update status
    const updateQuery = `
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
        updateProjectV2ItemFieldValue(
          input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: { singleSelectOptionId: $optionId }
          }
        ) {
          projectV2Item {
            id
          }
        }
      }
    `;

    const updateVars = {
      projectId: PROJECT_ID,
      itemId,
      fieldId: STATUS_FIELD_ID,
      optionId: STATUS_OPTIONS[statusName],
    };

    await githubAPI('POST', '/graphql', {
      query: updateQuery,
      variables: updateVars,
    });
    console.log(`Updated project status to: ${statusName}`);
  } catch (error) {
    console.error('Error updating project status:', error.message);
  }
}

// Main triage function
async function triageIssue() {
  console.log(`Triaging issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}`);

  // Build AI analysis prompt
  const prompt = `Analyze this GitHub issue and provide triage information.

Repository: happyvertical/sdk (TypeScript monorepo for AI agent development)

Issue #${ISSUE_NUMBER}
Title: ${ISSUE_TITLE}
Body: ${ISSUE_BODY || '(empty)'}
Author: ${ISSUE_AUTHOR}

Determine:
1. **type**: One of: bug, feature, enhancement, tech-debt, epic, documentation, question
2. **priority**: critical, high, medium, low
3. **urgency**: Should this go directly to "To Do" status? (only for security issues or critical bugs affecting production)
4. **affected_packages**: List of @have/ packages affected (e.g., ["@have/ai", "@have/sql"])
5. **reasoning**: Brief explanation of your analysis (2-3 sentences)

Return JSON in this exact format:
{
  "type": "bug|feature|enhancement|tech-debt|epic|documentation|question",
  "priority": "critical|high|medium|low",
  "urgency": "urgent|normal",
  "affected_packages": ["package names"],
  "reasoning": "explanation here"
}`;

  try {
    // Get AI analysis
    console.log('Calling GitHub Models API for analysis...');
    const analysis = await callGitHubModels(prompt);
    console.log('AI Analysis:', JSON.stringify(analysis, null, 2));

    // Search for duplicates
    console.log('Searching for potential duplicates...');
    const duplicates = await searchDuplicates(ISSUE_TITLE, ISSUE_BODY);
    console.log(`Found ${duplicates.length} potential duplicates`);

    // Prepare labels
    const labels = [];
    if (analysis.type) {
      labels.push(`type:${analysis.type}`);
    }

    // Apply labels
    if (labels.length > 0) {
      await applyLabels(labels);
    }

    // Build triage comment
    let comment = `## 🤖 AI Triage\n\n`;
    comment += `**Type**: \`${analysis.type}\`\n`;
    comment += `**Priority**: \`${analysis.priority}\`\n`;
    comment += `**Urgency**: \`${analysis.urgency}\`\n\n`;

    if (analysis.affected_packages && analysis.affected_packages.length > 0) {
      const packages = analysis.affected_packages
        .map((p) => `\`${p}\``)
        .join(', ');
      comment += `**Affected Packages**: ${packages}\n\n`;
    }

    comment += `**Analysis**: ${analysis.reasoning}\n\n`;

    if (duplicates.length > 0) {
      comment += `### ⚠️ Potential Duplicates\n\n`;
      duplicates.forEach((dup) => {
        comment += `- #${dup.number}: ${dup.title}\n`;
      });
      comment += `\n`;
    }

    comment += `---\n`;
    comment += `*This triage was performed automatically using GitHub Models API. Please review and adjust labels as needed.*`;

    // Post comment
    await postComment(comment);

    // Update project status if urgent
    if (analysis.urgency === 'urgent') {
      console.log('Issue marked as urgent, moving to "To Do" status...');
      await updateProjectStatus('To Do');
    }

    console.log('✅ Triage complete!');
  } catch (error) {
    console.error('❌ Triage failed:', error.message);
    console.error(error.stack);

    // Post error comment
    const errorComment = `## 🤖 AI Triage Failed\n\nAutomated triage encountered an error:\n\`\`\`\n${error.message}\n\`\`\`\n\nPlease triage this issue manually.`;
    await postComment(errorComment);

    process.exit(1);
  }
}

// Run triage
triageIssue();
