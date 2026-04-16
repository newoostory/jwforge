/**
 * Tests for Unit-9: Dual-copy deployment sync
 *
 * Verifies that every file deployed to /home/newoostory/.claude/jwforge/
 * is byte-identical to its source counterpart in /home/newoostory/jwforge/.
 *
 * Tests are expected to FAIL before the deployment copy is performed,
 * because the deployed files are outdated relative to the source files.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PROJECT_ROOT = '/home/newoostory/jwforge';
const DEPLOY_ROOT = '/home/newoostory/.claude/jwforge';

/** Map of source paths (relative to PROJECT_ROOT) -> deployed absolute paths */
const FILE_PAIRS = [
  ['hooks/phase-guard.mjs',         `${DEPLOY_ROOT}/hooks/phase-guard.mjs`],
  ['hooks/state-validator.mjs',     `${DEPLOY_ROOT}/hooks/state-validator.mjs`],
  ['hooks/artifact-validator.mjs',  `${DEPLOY_ROOT}/hooks/artifact-validator.mjs`],
  ['hooks/subagent-tracker.mjs',    `${DEPLOY_ROOT}/hooks/subagent-tracker.mjs`],
  ['hooks/lib/common.mjs',          `${DEPLOY_ROOT}/hooks/lib/common.mjs`],
  ['agents/analyst.md',             `${DEPLOY_ROOT}/agents/analyst.md`],
  ['agents/researcher.md',          `${DEPLOY_ROOT}/agents/researcher.md`],
  ['agents/designer.md',            `${DEPLOY_ROOT}/agents/designer.md`],
  ['agents/interviewer.md',         `${DEPLOY_ROOT}/agents/interviewer.md`],
  ['agents/reviewer-phase1.md',     `${DEPLOY_ROOT}/agents/reviewer-phase1.md`],
  ['agents/reviewer-phase2.md',     `${DEPLOY_ROOT}/agents/reviewer-phase2.md`],
  ['agents/reviewer-phase4.md',     `${DEPLOY_ROOT}/agents/reviewer-phase4.md`],
  ['skills/forge.md',               `${DEPLOY_ROOT}/skills/forge.md`],
  ['templates/compact-snapshot.md', `${DEPLOY_ROOT}/templates/compact-snapshot.md`],
];

describe('Unit-9: Dual-copy deployment sync', () => {
  for (const [relSource, deployedPath] of FILE_PAIRS) {
    const sourcePath = `${PROJECT_ROOT}/${relSource}`;

    it(`deployed ${relSource} is byte-identical to source`, () => {
      let sourceContent;
      try {
        sourceContent = readFileSync(sourcePath, 'utf8');
      } catch (err) {
        assert.fail(`Source file not readable at ${sourcePath}: ${err.message}`);
      }

      let deployedContent;
      try {
        deployedContent = readFileSync(deployedPath, 'utf8');
      } catch (err) {
        assert.fail(`Deployed file not readable at ${deployedPath}: ${err.message}`);
      }

      assert.strictEqual(
        deployedContent,
        sourceContent,
        `Deployed file ${deployedPath} does not match source ${sourcePath}`
      );
    });
  }
});
