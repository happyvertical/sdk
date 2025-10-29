# Communication Guidelines

## Using the Wizard for Questions

**ALWAYS use the AskUserQuestion wizard when asking clarifying questions.** Never ask questions in plain text.

The wizard provides:
- Structured, easy-to-answer questions
- Multiple choice options with clear descriptions
- Multi-select support for non-exclusive choices
- Better user experience than reading paragraphs of questions

## Examples of When to Use the Wizard

- Clarifying requirements during planning
- Asking about implementation approach
- Getting architectural decisions
- Confirming scope or priorities
- Resolving ambiguities in issues

## How to Use the Wizard

```typescript
// Use AskUserQuestion tool with 1-4 questions
// Each question has a header (max 12 chars), question text, and 2-4 options
// Each option has a label and description
```

### Example

```typescript
{
  questions: [
    {
      header: "Auth method",
      question: "Which authentication method should we use?",
      multiSelect: false,
      options: [
        {
          label: "OAuth 2.0",
          description: "Industry-standard protocol with good library support"
        },
        {
          label: "JWT",
          description: "Stateless tokens, good for microservices"
        },
        {
          label: "Session-based",
          description: "Traditional approach with server-side sessions"
        }
      ]
    }
  ]
}
```

## When NOT to Use the Wizard

**Exception**: Do not use the wizard for:
- Simple yes/no confirmations
- When context makes the answer obvious
- Follow-up clarifications during implementation
- Error messages or status updates
