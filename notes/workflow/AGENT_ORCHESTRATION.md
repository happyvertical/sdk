# Agent Orchestration Guidelines

When working with multiple agents in the HAVE SDK, follow these orchestration patterns.

## Delegation Patterns

### Sequential Pattern

Use when tasks have clear dependencies:

1. First agent completes foundation work
2. Next agent builds on previous output
3. Final agent refines or validates results

**Example**: `agent-reviewer` → `agent-trainer` (review first, then train based on findings)

### Parallel Pattern

Use when tasks can be done independently:

1. Delegate multiple non-dependent tasks simultaneously
2. Coordinate results at completion

**Example**: Multiple domain agents analyzing different packages concurrently

### Hierarchical Pattern

Use when tasks have sub-components:

1. Break down into major components
2. Delegate sub-components to specialized agents
3. Integrate results at each level

## Specialized Agents

The SDK includes specialized agents for specific workflows.

### Code Reviewer Agent

**Purpose**: Automated code review before PR creation

**Location**: `.claude/agents/code-reviewer.md`

**Responsibilities**:
- Verify testing standards (TESTING_STANDARD.md)
- Verify coding standards (CLAUDE.md)
- Check Definition of Done
- Coordinate Gemini code review (via MCP)
- Auto-fix issues when possible

**When to Use**:
- Automatically invoked by "Create PR" SOP
- Before pushing changes to remote
- Can be invoked manually for pre-PR review

**Example**:
```typescript
// Invoked automatically by PR SOP
// User says: "ready to create PR"
// Claude runs code-reviewer agent before pushing
```

See [Code Reviewer Agent](../../.claude/agents/code-reviewer.md) for complete documentation.

## Best Practices for Multi-Agent Coordination

- **Single Responsibility**: Each agent should focus on one domain
- **Clear Handoffs**: Pass relevant context between agent delegations
- **Avoid Redundancy**: Don't have multiple agents doing the same work
- **Validate Integration**: Ensure combined outputs meet requirements
- **Use TodoWrite**: Track complex multi-step workflows
- **Proactive Use**: Use specialized agents (like code-reviewer) automatically when appropriate

## Agent Performance Tracking

All agents sign their commits using `type(agent-name):` format, enabling:
- Performance analysis via `git log --grep="(agent-name):"`
- Error pattern detection through fix-to-feat ratios
- Continuous improvement based on actual performance

## When to Delegate

**Delegate to specialized agents when**:
- The task matches an agent's specific expertise
- Multiple domains need coordination
- Systematic review or updates are needed
- Complex workflows require specialized knowledge

**Direct implementation is preferred when**:
- The task is straightforward and within general capabilities
- No specialized domain knowledge is required
- The overhead of delegation exceeds the benefit
