#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🧹 Cleaning GoGetAJob data...\n');

const itemsToClean = [
  { path: 'data/workspaces', type: 'dir', desc: 'Project workspaces' },
  { path: '.gogetajob/temp', type: 'dir', desc: 'Temporary files' },
  { path: '.claude/worktrees', type: 'dir', desc: 'Claude worktrees' },
];

function deleteRecursive(itemPath) {
  if (!fs.existsSync(itemPath)) {
    return false;
  }

  if (fs.statSync(itemPath).isDirectory()) {
    fs.readdirSync(itemPath).forEach(file => {
      const curPath = path.join(itemPath, file);
      deleteRecursive(curPath);
    });
    fs.rmdirSync(itemPath);
  } else {
    fs.unlinkSync(itemPath);
  }
  return true;
}

let cleaned = 0;
let skipped = 0;

itemsToClean.forEach(item => {
  const fullPath = path.join(process.cwd(), item.path);
  const exists = fs.existsSync(fullPath);

  if (exists) {
    try {
      deleteRecursive(fullPath);
      console.log(`✓ Cleaned ${item.desc}: ${item.path}`);
      cleaned++;
    } catch (error) {
      console.log(`✗ Failed to clean ${item.desc}: ${error.message}`);
      skipped++;
    }
  } else {
    console.log(`- Skipped ${item.desc}: not found`);
    skipped++;
  }
});

console.log(`\n✅ Cleaning complete! (${cleaned} cleaned, ${skipped} skipped)`);
console.log('💡 Run "npm run clean:db" to also clean the database.\n');
