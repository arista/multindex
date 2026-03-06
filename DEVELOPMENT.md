# Development

## Prerequisites

- Node.js >= 20
- npm

## Setup

```bash
npm install
```

## Commands

- `npm run build` - Build the library
- `npm run dev` - Build in watch mode
- `npm test` - Run tests
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check formatting
- `npm run typecheck` - Run TypeScript type checking
- `npm run check` - Run all checks (typecheck, lint, format, test)

## Project Structure

```
src/           - Source code
test/          - Test files (*.test.ts)
dist/          - Build output (generated)
docs/          - Documentation
```

## Dependencies

This library depends on [chchchchanges](../chchchchanges) for reactivity support. Both libraries are co-developed, so chchchchanges is linked as a local dependency.
