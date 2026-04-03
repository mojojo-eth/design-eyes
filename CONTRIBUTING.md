# Contributing to Design Eyes

Thanks for your interest in improving AI-generated UI quality.

## Development

```bash
git clone https://github.com/mojojo-eth/design-eyes
cd design-eyes
npm install
npm run dev
```

## Adding Design Rules

Design rules live in `src/rules/analyzer.ts`. Each rule has:
- `name` — human-readable name
- `description` — what it checks
- `check` — how to detect the issue
- `fix_pattern` — how to fix it
- `severity` — critical / major / minor

## Testing

```bash
npm test
```

## Pull Requests

- One feature per PR
- Add tests for new rules
- Update README if adding tools
