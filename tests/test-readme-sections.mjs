/**
 * Unit-6: docs-and-migration
 * Tests that README.md contains required sections: Windows (SC7), Migration (SC8), LICENSE link (SC5).
 * These tests MUST FAIL before the executor adds the sections to README.md.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const README_PATH = resolve(__dirname, '..', 'README.md');

let readmeContent;
try {
  readmeContent = readFileSync(README_PATH, 'utf8');
} catch (err) {
  // Hard fail — if README doesn't exist at all, all tests should fail loudly.
  readmeContent = '';
}

describe('README.md — docs-and-migration (Unit-6)', () => {

  // SC7: Windows heading (any level >= 2)
  it('SC7: has a Windows heading (## Windows or deeper)', () => {
    const windowsHeadingRe = /^#{2,}\s*Windows/m;
    assert.ok(
      windowsHeadingRe.test(readmeContent),
      'README.md must contain a heading like "## Windows" (level 2 or deeper)'
    );
  });

  // SC7: WSL install link
  it('SC7: contains the WSL install link (learn.microsoft.com/.../wsl/install)', () => {
    const wslLink = 'learn.microsoft.com/en-us/windows/wsl/install';
    assert.ok(
      readmeContent.includes(wslLink),
      `README.md must contain the WSL install URL: ${wslLink}`
    );
  });

  // SC8: Migration heading (any level >= 2) + section body mentions uninstall.sh --global
  it('SC8: has a Migration heading (## Migration or deeper)', () => {
    const migrationHeadingRe = /^#{2,}\s*Migration/m;
    assert.ok(
      migrationHeadingRe.test(readmeContent),
      'README.md must contain a heading like "## Migration" (level 2 or deeper)'
    );
  });

  it('SC8: Migration section body mentions "uninstall.sh --global"', () => {
    // Extract text between the Migration heading and the next heading (or EOF)
    const migrationSectionRe = /^#{2,}\s*Migration[^\n]*\n([\s\S]*?)(?=^#{1,}\s|\s*$)/m;
    const match = readmeContent.match(migrationSectionRe);

    assert.ok(
      match !== null,
      'README.md must contain a Migration section with body text'
    );

    const sectionBody = match[1];
    assert.ok(
      sectionBody.includes('uninstall.sh --global'),
      'The Migration section must mention "uninstall.sh --global" to guide existing global-install users'
    );
  });

  // SC5: LICENSE link somewhere in the file
  it('SC5: contains a link to LICENSE file', () => {
    // Match [LICENSE](LICENSE) or [LICENSE](./LICENSE) or [LICENSE](LICENSE.txt) etc.
    const licenseLinkRe = /\[LICENSE\]\(\.?\/?LICENSE[^)]*\)/i;
    assert.ok(
      licenseLinkRe.test(readmeContent),
      'README.md must contain a markdown link to LICENSE, e.g. [LICENSE](LICENSE)'
    );
  });

});
