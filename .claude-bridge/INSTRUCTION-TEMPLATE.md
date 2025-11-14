# Instruction Template for Claude AI

When creating fix instructions, save them as:
`.claude-bridge/inbox/fix-[timestamp].md`

## Required Format:

```markdown
# Fix: [Brief Description]

## Problem
[What's broken]

## Solution
[What needs to be changed]

## Search Code For:
- "exact string to search"
- "another string"

## Changes Required:

### File: `path/to/file.jsx`
```jsx
// New code here
```

### Replace:
Change from:
```jsx
old code
```
To:
```jsx
new code
```
```
