/**
 * Unit-2: Forge.md Conductor protocol fixes
 *
 * Tests that skills/forge.md contains the four required additions:
 *   R2  — HARD PROHIBITION on using Read/Grep/Glob on project source files for analysis
 *   R5  — "Agent Write Failure Protocol" section with up-to-3-retry logic
 *   R8  — HARD PROHIBITION on claiming an agent wrote a file the Conductor wrote itself
 *   R10 — "Continuation Session Protocol" section at end of forge.md
 *
 * These tests READ skills/forge.md and assert required content is present.
 * They are expected to FAIL before implementation (the content is not yet in forge.md).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const forgePath = join(__dirname, '..', 'skills', 'forge.md');

let forgeContent;
try {
  forgeContent = readFileSync(forgePath, 'utf8');
} catch (err) {
  forgeContent = null;
}

describe('Unit-2: skills/forge.md required additions', () => {

  it('forge.md exists and is readable', () => {
    assert.ok(forgeContent !== null, `skills/forge.md could not be read: ${forgePath}`);
    assert.ok(forgeContent.length > 0, 'skills/forge.md is empty');
  });

  // R2 — HARD PROHIBITION on Read/Grep/Glob for analysis
  it('R2: contains prohibition on using Read, Grep, or Glob on project source files for analysis', () => {
    assert.ok(
      forgeContent !== null,
      'skills/forge.md is unreadable — cannot check R2'
    );
    const hasR2 = /Read[,\s]+Grep[,\s]+or[,\s]+Glob.*project source files/is.test(forgeContent) ||
                  /NEVER use Read.*Grep.*Glob.*project source files/is.test(forgeContent) ||
                  /Read.*Grep.*Glob.*analysis/is.test(forgeContent);
    assert.ok(
      hasR2,
      'R2 prohibition not found: skills/forge.md must contain a HARD PROHIBITION about using Read, Grep, or Glob on project source files for analysis purposes'
    );
  });

  // R5 — Agent Write Failure Protocol section
  it('R5: contains "Agent Write Failure Protocol" section', () => {
    assert.ok(
      forgeContent !== null,
      'skills/forge.md is unreadable — cannot check R5'
    );
    const hasSection = /Agent Write Failure Protocol/i.test(forgeContent);
    assert.ok(
      hasSection,
      'R5 section not found: skills/forge.md must contain an "Agent Write Failure Protocol" section'
    );
  });

  it('R5: Agent Write Failure Protocol mentions retrying up to 3 times', () => {
    assert.ok(
      forgeContent !== null,
      'skills/forge.md is unreadable — cannot check R5 retry count'
    );
    // Must mention 3 retries somewhere in or near the Agent Write Failure Protocol section
    const sectionMatch = forgeContent.match(
      /Agent Write Failure Protocol[\s\S]{0,1500}/i
    );
    const sectionText = sectionMatch ? sectionMatch[0] : forgeContent;
    const mentionsThreeRetries =
      /re.?spawn.{0,50}3\s+times/i.test(sectionText) ||
      /up\s+to\s+3/i.test(sectionText) ||
      /3\s+retries/i.test(sectionText) ||
      /retry.{0,30}3/i.test(sectionText) ||
      /3\s+attempts/i.test(sectionText) ||
      /max.{0,30}3/i.test(sectionText);
    assert.ok(
      mentionsThreeRetries,
      'R5: Agent Write Failure Protocol section must mention retrying/re-spawning up to 3 times'
    );
  });

  // R8 — HARD PROHIBITION on claiming an agent wrote a file the Conductor wrote itself
  it('R8: contains prohibition on claiming an agent wrote a file that you wrote yourself', () => {
    assert.ok(
      forgeContent !== null,
      'skills/forge.md is unreadable — cannot check R8'
    );
    const hasR8 =
      /NEVER claim.*agent wrote.*file.*you wrote/is.test(forgeContent) ||
      /NEVER.*claim.*agent.*wrote.*yourself/is.test(forgeContent) ||
      /claim.*agent wrote a file.*you wrote yourself/is.test(forgeContent) ||
      /claim.*agent.*wrote.*Conductor.*wrote/is.test(forgeContent) ||
      /falsely.*attribute.*agent.*wrote/is.test(forgeContent);
    assert.ok(
      hasR8,
      'R8 prohibition not found: skills/forge.md must contain a HARD PROHIBITION about claiming an agent wrote a file that the Conductor wrote itself'
    );
  });

  // R10 — Continuation Session Protocol section
  it('R10: contains "Continuation Session Protocol" section', () => {
    assert.ok(
      forgeContent !== null,
      'skills/forge.md is unreadable — cannot check R10'
    );
    const hasSection = /Continuation Session Protocol/i.test(forgeContent);
    assert.ok(
      hasSection,
      'R10 section not found: skills/forge.md must contain a "Continuation Session Protocol" section'
    );
  });

  it('R10: Continuation Session Protocol section mentions state-recorder', () => {
    assert.ok(
      forgeContent !== null,
      'skills/forge.md is unreadable — cannot check R10 state-recorder reference'
    );
    const sectionMatch = forgeContent.match(
      /Continuation Session Protocol[\s\S]{0,2000}/i
    );
    const sectionText = sectionMatch ? sectionMatch[0] : '';
    assert.ok(
      /state.recorder/i.test(sectionText),
      'R10: Continuation Session Protocol section must mention state-recorder'
    );
  });

  it('R10: Continuation Session Protocol section mentions user gates for Phase 2->3 and Phase 3->4', () => {
    assert.ok(
      forgeContent !== null,
      'skills/forge.md is unreadable — cannot check R10 user gates'
    );
    const sectionMatch = forgeContent.match(
      /Continuation Session Protocol[\s\S]{0,2000}/i
    );
    const sectionText = sectionMatch ? sectionMatch[0] : '';
    const mentionsUserGates =
      /user\s+gate/i.test(sectionText) ||
      /Phase\s+[23].{0,10}[->→].{0,10}[34]/i.test(sectionText) ||
      /2\s*->\s*3/i.test(sectionText) ||
      /3\s*->\s*4/i.test(sectionText) ||
      /phase\s+2.{0,50}phase\s+3/i.test(sectionText) ||
      /phase\s+3.{0,50}phase\s+4/i.test(sectionText);
    assert.ok(
      mentionsUserGates,
      'R10: Continuation Session Protocol section must mention user gates / Phase 2->3 and Phase 3->4 transitions'
    );
  });

});
