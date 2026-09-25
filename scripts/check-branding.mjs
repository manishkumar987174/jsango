#!/usr/bin/env node
/* global console, process */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const rootDir = process.cwd();

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.turbo',
  'dist',
  'build',
  'coverage',
  '.idea',
  '.vscode',
]);

const IGNORED_EXTENSIONS = new Set([
  '.tsbuildinfo',
  '.map',
  '.lock',
]);

const ALLOWED_FILES = new Set([
  'docs/MIGRATION-DJANGO-JS-TO-JSANGO.md',
  'PROJECT_STATUS.md',
  'scripts/check-branding.mjs',
]);

// Restricted patterns associated with the legacy project identity
const FORBIDDEN_PATTERNS = [
  /@django-js\b/gi,
  /django-js\b/gi,
  /django_js\b/gi,
  /Django-JS\b/g,
  /DjangoJS\b/g,
  /DjangoJs\b/g,
  /DJANGO_JS\b/g,
];

let violations = [];

async function scanDir(dir) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = join(dir, entry.name);
    const relPath = relative(rootDir, fullPath);

    if (ALLOWED_FILES.has(relPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      await scanDir(fullPath);
    } else if (entry.isFile()) {
      const ext = entry.name.slice(entry.name.lastIndexOf('.'));
      if (IGNORED_EXTENSIONS.has(ext) || entry.name.endsWith('.tsbuildinfo')) {
        continue;
      }
      // Check file name
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(entry.name)) {
          violations.push({
            file: relPath,
            line: 0,
            snippet: `Filename contains forbidden brand: ${entry.name}`,
          });
        }
      }

      // Read text content
      try {
        const content = await readFile(fullPath, 'utf8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
          // Allow references to the migration guide document itself
          const lineWithoutMigrationRef = line.replaceAll('MIGRATION-DJANGO-JS-TO-JSANGO.md', '');
          for (const pattern of FORBIDDEN_PATTERNS) {
            pattern.lastIndex = 0;
            if (pattern.test(lineWithoutMigrationRef)) {
              violations.push({
                file: relPath,
                line: index + 1,
                snippet: line.trim(),
              });
              break;
            }
          }
        });
      } catch {
        // Binary or unreadable file, skip
      }
    }
  }
}

console.log('🔍 Auditing repository for legacy branding identifiers...');
await scanDir(rootDir);

if (violations.length > 0) {
  console.error(`\n❌ Found ${violations.length} forbidden legacy brand reference(s):`);
  for (const v of violations) {
    console.error(`  - ${v.file}${v.line > 0 ? `:${v.line}` : ''} -> ${v.snippet}`);
  }
  process.exit(1);
} else {
  console.log('✅ Branding validation passed! No legacy framework references detected.');
  process.exit(0);
}
