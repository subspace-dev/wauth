#!/bin/bash

# Run all wauth development servers concurrently with named prefixes
concurrently \
  --names "backend,sdk,strategy,demo" \
  --prefix-colors "magenta,cyan,red,green" \
  "cd backend && bun run dev" \
  "cd sdk && npm run dev" \
  "cd strategy && npm run dev" \
  "cd demo && bun run dev"
