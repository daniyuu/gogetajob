#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🗑️  Cleaning database...\n');

const dbFiles = [
  'data/gogetajob.db',
  'data/gogetajob.db-journal',
  'data/gogetajob.db-shm',
  'data/gogetajob.db-wal',
];

function forceDeleteFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  try {
    // First try normal delete
    fs.unlinkSync(filePath);
    return true;
  } catch (error) {
    console.log(`   File is locked, attempting force delete...`);
    try {
      // On Windows, use del /f to force delete
      if (process.platform === 'win32') {
        execSync(`del /f /q "${filePath}"`, { stdio: 'ignore' });
      } else {
        // On Unix-like systems, use rm -f
        execSync(`rm -f "${filePath}"`, { stdio: 'ignore' });
      }
      return !fs.existsSync(filePath);
    } catch (forceError) {
      return false;
    }
  }
}

let cleaned = 0;
let failed = 0;

dbFiles.forEach(dbFile => {
  const fullPath = path.join(process.cwd(), dbFile);
  if (fs.existsSync(fullPath)) {
    if (forceDeleteFile(fullPath)) {
      console.log(`✓ Deleted ${dbFile}`);
      cleaned++;
    } else {
      console.log(`✗ Failed to delete ${dbFile}`);
      failed++;
    }
  }
});

if (cleaned === 0 && failed === 0) {
  console.log('- No database files found\n');
} else {
  console.log(`\n✅ Database cleaning complete! (${cleaned} deleted, ${failed} failed)\n`);
  if (failed > 0) {
    console.log('💡 Tip: Stop the server and try again if files are locked.\n');
  }
}
