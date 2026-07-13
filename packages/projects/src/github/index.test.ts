import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubProject } from './index.js';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  query: vi.fn(),
}));

vi.mock('@happyvertical/graphql', () => ({
  // biome-ignore lint/style/useNamingConvention: Mock export must match the module export.
  GraphQLClient: class {
    query = mocks.query;
    mutate = mocks.mutate;
  },
}));

function createProject(statusFieldId?: string): GitHubProject {
  return new GitHubProject({
    type: 'github',
    projectId: 'PVT_project',
    token: 'test-token',
    statusFieldId,
  });
}

function content(
  typename: 'Issue' | 'PullRequest' | 'DraftIssue',
  id: string,
  title = `${typename} title`,
) {
  return {
    typename,
    id,
    title,
    ...(typename === 'DraftIssue'
      ? {}
      : { url: `https://github.test/items/${id}` }),
    assignees: {
      nodes: [{ login: `${id}-owner` }],
    },
  };
}

function field(id: string, name: string) {
  return { id, name };
}

function item(
  id: string,
  itemContent: ReturnType<typeof content> | null,
  fieldValues: unknown[] = [],
) {
  return {
    id,
    content: itemContent,
    fieldValues: { nodes: fieldValues },
  };
}

function page(
  nodes: unknown[],
  pageInfo = { hasNextPage: false, endCursor: null as string | null },
) {
  return {
    node: {
      items: {
        nodes,
        pageInfo,
      },
    },
  };
}

describe('GitHubProject item writes and reads', () => {
  beforeEach(() => {
    mocks.mutate.mockReset();
    mocks.query.mockReset();
  });

  it('returns the added content type', async () => {
    mocks.mutate.mockResolvedValue({
      addProjectV2ItemById: {
        item: {
          id: 'PVTI_pr',
          content: { id: 'PR_pr', typename: 'PullRequest' },
        },
      },
    });

    const result = await createProject().addItem('PR_pr');

    expect(result).toEqual({
      id: 'PVTI_pr',
      contentId: 'PR_pr',
      fields: {},
      type: 'PullRequest',
    });
    expect(mocks.mutate.mock.calls[0]?.[0]).toContain('typename: __typename');
  });

  it('returns draft issues with their real type', async () => {
    mocks.query.mockResolvedValue({
      node: {
        id: 'PVTI_draft',
        content: { id: 'DI_draft', typename: 'DraftIssue' },
      },
    });

    const result = await createProject().getItem('PVTI_draft');

    expect(result).toEqual({
      id: 'PVTI_draft',
      contentId: 'DI_draft',
      fields: {},
      type: 'DraftIssue',
    });
    expect(mocks.query.mock.calls[0]?.[0]).toContain('... on DraftIssue');
  });

  it('returns null when an item or its content is inaccessible', async () => {
    mocks.query.mockResolvedValue({
      node: { id: 'PVTI_redacted', content: null },
    });

    await expect(createProject().getItem('PVTI_redacted')).resolves.toBeNull();
  });
});

describe('GitHubProject.listItems', () => {
  beforeEach(() => {
    mocks.mutate.mockReset();
    mocks.query.mockReset();
  });

  it('maps issues, pull requests, draft issues, content metadata, and provider fields', async () => {
    mocks.query.mockResolvedValue(
      page([
        item('PVTI_issue', content('Issue', 'I_issue'), [
          {
            typename: 'ProjectV2ItemFieldSingleSelectValue',
            field: field('status', 'Status'),
            name: 'In Progress',
          },
          {
            typename: 'ProjectV2ItemFieldNumberValue',
            field: field('estimate', 'Estimate'),
            number: 5,
          },
          {
            typename: 'ProjectV2ItemFieldDateValue',
            field: field('target-date', 'Target date'),
            date: '2026-07-20',
          },
          {
            typename: 'ProjectV2ItemFieldIterationValue',
            field: field('iteration', 'Iteration'),
            title: 'Sprint 1',
          },
          {
            typename: 'ProjectV2ItemFieldLabelValue',
            field: field('labels', 'Labels'),
            labels: { nodes: [{ name: 'bug' }, null] },
          },
          {
            typename: 'ProjectV2ItemFieldMilestoneValue',
            field: field('milestone', 'Milestone'),
            milestone: { title: 'MVP' },
          },
          {
            typename: 'ProjectV2ItemFieldPullRequestValue',
            field: field('linked-prs', 'Linked pull requests'),
            pullRequests: {
              nodes: [{ url: 'https://github.test/pulls/1' }, null],
            },
          },
          {
            typename: 'ProjectV2ItemFieldRepositoryValue',
            field: field('repository', 'Repository'),
            repository: { nameWithOwner: 'happyvertical/sdk' },
          },
          {
            typename: 'ProjectV2ItemFieldReviewerValue',
            field: field('reviewers', 'Reviewers'),
            reviewers: {
              nodes: [{ login: 'octocat' }, { slug: 'sdk-team' }, null],
            },
          },
          {
            typename: 'ProjectV2ItemFieldTextValue',
            field: field('notes', 'Notes'),
            text: 'Ready for review',
          },
          {
            typename: 'ProjectV2ItemFieldTextValue',
            field: field('custom-title', 'title'),
            text: 'Custom title field',
          },
          {
            typename: 'ProjectV2ItemFieldTextValue',
            field: field('custom-url', 'url'),
            text: 'Custom URL field',
          },
          {
            typename: 'ProjectV2ItemFieldTextValue',
            field: field('custom-assignees', 'assignees'),
            text: 'Custom assignees field',
          },
          {
            typename: 'ProjectV2ItemFieldTextValue',
            field: field('prototype-name', '__proto__'),
            text: 'Prototype-safe field',
          },
          {
            typename: 'ProjectV2ItemFieldUserValue',
            field: field('owners', 'Owners'),
            users: { nodes: [{ login: 'willgriffin' }, null] },
          },
          {
            typename: 'ProjectV2ItemIssueFieldValue',
            field: field('roadmap', 'Roadmap'),
            issueFieldValue: {
              typename: 'IssueFieldSingleSelectValue',
              name: 'Committed',
              singleSelectValue: 'committed',
            },
          },
          {
            typename: 'ProjectV2ItemIssueFieldValue',
            field: field('teams', 'Teams'),
            issueFieldValue: {
              typename: 'IssueFieldMultiSelectValue',
              multiSelectOptions: [{ name: 'Platform' }, { name: 'SDK' }],
            },
          },
        ]),
        item('PVTI_pr', content('PullRequest', 'PR_pr')),
        item('PVTI_draft', content('DraftIssue', 'DI_draft')),
      ]),
    );

    const result = await createProject().listItems();
    const expectedProviderFields = Object.fromEntries([
      ['Status', 'In Progress'],
      ['Estimate', 5],
      ['Target date', '2026-07-20'],
      ['Iteration', 'Sprint 1'],
      ['Labels', ['bug']],
      ['Milestone', 'MVP'],
      ['Linked pull requests', ['https://github.test/pulls/1']],
      ['Repository', 'happyvertical/sdk'],
      ['Reviewers', ['octocat', 'sdk-team']],
      ['Notes', 'Ready for review'],
      ['title', 'Custom title field'],
      ['url', 'Custom URL field'],
      ['assignees', 'Custom assignees field'],
      ['__proto__', 'Prototype-safe field'],
      ['Owners', ['willgriffin']],
      ['Roadmap', 'Committed'],
      ['Teams', ['Platform', 'SDK']],
    ]);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      id: 'PVTI_issue',
      contentId: 'I_issue',
      type: 'Issue',
      title: 'Issue title',
      url: 'https://github.test/items/I_issue',
      assignees: ['I_issue-owner'],
      status: 'In Progress',
      fields: expectedProviderFields,
    });
    expect(Object.getPrototypeOf(result[0]?.fields)).toBe(Object.prototype);
    expect(Object.hasOwn(result[0]?.fields ?? {}, '__proto__')).toBe(true);
    expect(result[1]).toMatchObject({
      id: 'PVTI_pr',
      contentId: 'PR_pr',
      type: 'PullRequest',
      title: 'PullRequest title',
      url: 'https://github.test/items/PR_pr',
      assignees: ['PR_pr-owner'],
      fields: {},
    });
    expect(result[2]).toMatchObject({
      id: 'PVTI_draft',
      contentId: 'DI_draft',
      type: 'DraftIssue',
      title: 'DraftIssue title',
      url: null,
      assignees: ['DI_draft-owner'],
      fields: {},
    });

    const [query] = mocks.query.mock.calls[0] ?? [];
    expect(query).toContain('fieldValues(first: 50)');
    expect(query).toContain('labels(first: 100)');
    expect(query).toContain('pullRequests(first: 100)');
    expect(query).toContain('reviewers(first: 100)');
    expect(query).toContain('users(first: 100)');
  });

  it('uses a configured status field instead of the canonical Status field', async () => {
    mocks.query.mockResolvedValue(
      page([
        item('PVTI_issue', content('Issue', 'I_issue'), [
          {
            typename: 'ProjectV2ItemFieldSingleSelectValue',
            field: field('canonical-status', 'Status'),
            name: 'Todo',
          },
          {
            typename: 'ProjectV2ItemFieldSingleSelectValue',
            field: field('custom-phase', 'Phase'),
            name: 'Building',
          },
        ]),
      ]),
    );

    const [result] = await createProject('custom-phase').listItems();

    expect(result.status).toBe('Building');
    expect(result.fields).toMatchObject(
      Object.fromEntries([
        ['Status', 'Todo'],
        ['Phase', 'Building'],
      ]),
    );
  });

  it('skips deleted or inaccessible item content', async () => {
    mocks.query.mockResolvedValueOnce(
      page([
        null,
        item('PVTI_redacted', null),
        item('PVTI_issue', content('Issue', 'I_issue')),
      ]),
    );

    const result = await createProject().listItems();

    expect(result.map((projectItem) => projectItem.id)).toEqual(['PVTI_issue']);
  });

  it('reports a missing or inaccessible project', async () => {
    mocks.query.mockResolvedValue({ node: null });

    await expect(createProject().listItems()).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('follows pagination from the requested cursor and honors the accessible-item limit', async () => {
    mocks.query
      .mockResolvedValueOnce(
        page(
          [
            item('PVTI_issue', content('Issue', 'I_issue')),
            item('PVTI_redacted', null),
          ],
          { hasNextPage: true, endCursor: 'cursor-1' },
        ),
      )
      .mockResolvedValueOnce(
        page([item('PVTI_pr', content('PullRequest', 'PR_pr'))]),
      );

    const result = await createProject().listItems({
      cursor: 'starting-cursor',
      limit: 2,
    });

    expect(result.map((projectItem) => projectItem.id)).toEqual([
      'PVTI_issue',
      'PVTI_pr',
    ]);
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.query.mock.calls[0]?.[1]).toEqual({
      projectId: 'PVT_project',
      first: 2,
      after: 'starting-cursor',
    });
    expect(mocks.query.mock.calls[1]?.[1]).toEqual({
      projectId: 'PVT_project',
      first: 20,
      after: 'cursor-1',
    });
  });

  it('only requests the remaining count when prior content was accessible', async () => {
    mocks.query
      .mockResolvedValueOnce(
        page(
          Array.from({ length: 20 }, (_, index) =>
            item(`PVTI_${index}`, content('Issue', `I_${index}`)),
          ),
          { hasNextPage: true, endCursor: 'cursor-1' },
        ),
      )
      .mockResolvedValueOnce(
        page(
          Array.from({ length: 5 }, (_, index) =>
            item(`PVTI_${index + 20}`, content('Issue', `I_${index + 20}`)),
          ),
        ),
      );

    const result = await createProject().listItems({ limit: 25 });

    expect(result).toHaveLength(25);
    expect(mocks.query.mock.calls[0]?.[1].first).toBe(20);
    expect(mocks.query.mock.calls[1]?.[1].first).toBe(5);
  });

  it('preserves the historical 100-item default limit', async () => {
    for (let pageIndex = 0; pageIndex < 5; pageIndex += 1) {
      mocks.query.mockResolvedValueOnce(
        page(
          Array.from({ length: 20 }, (_, itemIndex) => {
            const id = `${pageIndex}-${itemIndex}`;
            return item(`PVTI_${id}`, content('Issue', `I_${id}`));
          }),
          { hasNextPage: true, endCursor: `cursor-${pageIndex}` },
        ),
      );
    }

    const result = await createProject().listItems();

    expect(result).toHaveLength(100);
    expect(mocks.query).toHaveBeenCalledTimes(5);
    for (const [, variables] of mocks.query.mock.calls) {
      expect(variables.first).toBe(20);
    }
  });
});
