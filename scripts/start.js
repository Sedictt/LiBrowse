#!/usr/bin/env node

/**
 * Librowse - Startup Script
 * This script helps you get started with the Librowse application
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Librowse Setup...\n');

// Check if .env file exists
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
    console.log('⚠️  No .env file found. Creating from .env.example...');
    try {
        const examplePath = path.join(__dirname, '..', '.env.example');
        if (fs.existsSync(examplePath)) {
            fs.copyFileSync(examplePath, envPath);
            console.log('✅ Created .env file from .env.example');
            console.log('📝 Please edit .env file with your database credentials\n');
        }
    } catch (error) {
        console.error('❌ Failed to create .env file:', error.message);
    }
}

// Check if node_modules exists
const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
if (!fs.existsSync(nodeModulesPath)) {
    console.log('📦 Installing dependencies...');
    try {
        execSync('npm install', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
        console.log('✅ Dependencies installed successfully\n');
    } catch (error) {
        console.error('❌ Failed to install dependencies:', error.message);
        process.exit(1);
    }
}

console.log('🎉 Setup complete! You can now:');
console.log('1. Edit your .env file with database credentials');
console.log('2. Run database setup: node scripts/setup.js');
console.log('3. Start the server: npm start');
console.log('\n📚 Visit http://localhost:3000 once the server is running');
