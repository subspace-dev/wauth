#!/bin/bash

# Run all development servers concurrently with named prefixes
concurrently \
  --names "pocketbase,backend" \
  --prefix-colors "magenta,cyan" \
  "bun run start:pocketbase" \
  "bun run start:backend"