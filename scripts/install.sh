#!/bin/bash

# WAuth Install Script
# Installs dependencies for all subfolders with their respective package managers

set -e  # Exit on any error

echo "🚀 Starting WAuth installation process..."

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to install dependencies in a directory
install_deps() {
    local dir="$1"
    local package_manager="$2"
    
    if [ ! -f "$dir/package.json" ]; then
        echo "⚠️  No package.json found in $dir, skipping..."
        return 0
    fi  
    
    echo "📦 Installing dependencies in $dir using $package_manager..."
    cd "$dir"
    
    case "$package_manager" in
        "bun")
            if command_exists bun; then
                bun install
            else
                echo "❌ bun is not installed. Please install bun first: https://bun.sh"
                exit 1
            fi
            ;;
        "npm")
            if command_exists npm; then
                npm install
            else
                echo "❌ npm is not installed. Please install Node.js and npm first"
                exit 1
            fi
            ;;
        *)
            echo "❌ Unknown package manager: $package_manager"
            exit 1
            ;;
    esac
    
    cd - > /dev/null
    echo "✅ Dependencies installed in $dir"
}

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "📁 Project root: $PROJECT_ROOT"
echo ""

# Install root dependencies (uses bun)
echo "🏠 Installing root dependencies..."
install_deps "$PROJECT_ROOT" "bun"

# Install backend dependencies (uses bun)
echo ""
echo "🔧 Installing backend dependencies..."
install_deps "$PROJECT_ROOT/backend" "bun"

# Install SDK dependencies (uses npm)
echo ""
echo "📚 Installing SDK dependencies..."
install_deps "$PROJECT_ROOT/sdk" "npm"

# Install strategy dependencies (uses npm)
echo ""
echo "🎯 Installing strategy dependencies..."
install_deps "$PROJECT_ROOT/strategy" "npm"

# Install demo dependencies (uses bun)
echo ""
echo "🎮 Installing demo dependencies..."
install_deps "$PROJECT_ROOT/demo" "bun"

echo ""
echo "🎉 All dependencies installed successfully!"
echo ""
echo "📋 Summary:"
echo "  ✅ Root dependencies (bun)"
echo "  ✅ Backend dependencies (bun)"
echo "  ✅ SDK dependencies (npm)"
echo "  ✅ Strategy dependencies (npm)"
echo "  ✅ Demo dependencies (bun)"
echo ""
echo "🚀 You can now run:"
echo "  • bun run dev     - Start development environment"
echo "  • bun run build   - Build all packages"
echo "  • bun run demo    - Start demo application"
echo "  • bun run backend - Start backend server"
