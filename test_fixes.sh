#!/bin/bash

# Quick test to verify the fixes
echo "Running CarbonFlow contract tests..."

cd /Users/a/Documents/stacks/alexuduak742/CarbonFlow

# Run tests and capture output
npm test 2>&1 | head -50

echo ""
echo "Test verification complete."
