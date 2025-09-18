#!/bin/bash

# WAuth Project Build Script
# This script builds the entire project in the correct order:
# 1. Build SDK
# 2. Install SDK in Strategy
# 3. Build Strategy
# 4. Install Strategy and SDK in Demo
# 5. Build Demo

set -e  # Exit on any error

echo "🚀 Starting WAuth Project Build Process..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_step() {
    echo -e "${BLUE}📦 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to clean node_modules and package-lock.json
clean_dependencies() {
    local dir=$1
    print_step "Cleaning dependencies in $dir"
    
    if [ -d "$dir/node_modules" ]; then
        rm -rf "$dir/node_modules"
        print_success "Removed node_modules from $dir"
    fi
    
    if [ -f "$dir/package-lock.json" ]; then
        rm -f "$dir/package-lock.json"
        print_success "Removed package-lock.json from $dir"
    fi
    
    if [ -f "$dir/bun.lock" ]; then
        rm -f "$dir/bun.lock"
        print_success "Removed bun.lock from $dir"
    fi
}

# Function to install dependencies
install_dependencies() {
    local dir=$1
    local package_manager=$2
    
    print_step "Installing dependencies in $dir using $package_manager"
    
    cd "$dir"
    
    if [ "$package_manager" = "npm" ]; then
        npm install
    elif [ "$package_manager" = "bun" ]; then
        bun install
    else
        print_error "Unknown package manager: $package_manager"
        exit 1
    fi
    
    print_success "Dependencies installed in $dir"
    cd - > /dev/null
}

# Function to build package
build_package() {
    local dir=$1
    local package_manager=$2
    
    print_step "Building $dir using $package_manager"
    
    cd "$dir"
    
    if [ "$package_manager" = "npm" ]; then
        npm run build
    elif [ "$package_manager" = "bun" ]; then
        bun run build
    else
        print_error "Unknown package manager: $package_manager"
        exit 1
    fi
    
    print_success "Built $dir successfully"
    cd - > /dev/null
}

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "Project root: $PROJECT_ROOT"

# Step 1: Build SDK
print_step "Step 1: Building SDK"
clean_dependencies "sdk"
install_dependencies "sdk" "npm"
build_package "sdk" "npm"

# Step 2: Install SDK in Strategy
print_step "Step 2: Installing SDK in Strategy"
clean_dependencies "strategy"
install_dependencies "strategy" "npm"

# Step 3: Build Strategy
print_step "Step 3: Building Strategy"
build_package "strategy" "npm"

# Step 4: Install Dependencies in Demo (for development)
print_step "Step 4: Installing Dependencies in Demo"
clean_dependencies "demo"
install_dependencies "demo" "bun"

# Step 5: Build Demo (produces dist folder by default)
print_step "Step 5: Building Demo"
cd "demo"
# Use build-specific TypeScript config
cp tsconfig.build.json tsconfig.app.json
# Build with Vite only (skip TypeScript compilation)
bun run vite build
# Restore original config
git checkout tsconfig.app.json
cd - > /dev/null

print_success "🎉 WAuth Project Build Complete!"
echo ""
echo "Build Summary:"
echo "  ✅ SDK built and ready"
echo "  ✅ Strategy built with SDK dependency"
echo "  ✅ Demo built and ready for deployment"
echo ""
echo "Demo is ready for deployment from: demo/dist/"
echo ""
echo "For development mode, run:"
echo "  cd demo && bun run dev"
