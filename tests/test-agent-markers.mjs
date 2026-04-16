import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = new URL('..', import.meta.url).pathname;
const AGENTS_DIR = join(PROJECT_ROOT, 'agents');

function readAgent(filename) {
  return readFileSync(join(AGENTS_DIR, filename), 'utf8');
}

describe('Agent prompt marker additions', () => {
  describe('analyst.md', () => {
    it('contains instruction to add <!-- _agent: analyst --> as first line of output file', () => {
      const content = readAgent('analyst.md');
      assert.ok(
        content.includes('<!-- _agent: analyst -->'),
        'analyst.md must contain the marker instruction <!-- _agent: analyst -->'
      );
    });

    it('contains instruction that marker must be the first line before any heading', () => {
      const content = readAgent('analyst.md');
      // Check for the instruction about being first line / before any heading
      assert.ok(
        content.includes('first line') || content.includes('very first line'),
        'analyst.md must instruct that the marker is the first line of the written file'
      );
    });
  });

  describe('researcher.md', () => {
    it('contains instruction to add <!-- _agent: researcher --> as first line of output file', () => {
      const content = readAgent('researcher.md');
      assert.ok(
        content.includes('<!-- _agent: researcher -->'),
        'researcher.md must contain the marker instruction <!-- _agent: researcher -->'
      );
    });

    it('contains instruction that marker must be the first line before any heading', () => {
      const content = readAgent('researcher.md');
      assert.ok(
        content.includes('first line') || content.includes('very first line'),
        'researcher.md must instruct that the marker is the first line of the written file'
      );
    });
  });

  describe('designer.md', () => {
    it('contains instruction to add <!-- _agent: designer --> as first line of output file', () => {
      const content = readAgent('designer.md');
      assert.ok(
        content.includes('<!-- _agent: designer -->'),
        'designer.md must contain the marker instruction <!-- _agent: designer -->'
      );
    });

    it('contains instruction that marker must be the first line before any heading', () => {
      const content = readAgent('designer.md');
      assert.ok(
        content.includes('first line') || content.includes('very first line'),
        'designer.md must instruct that the marker is the first line of the written file'
      );
    });
  });

  describe('interviewer.md', () => {
    it('contains instruction to add <!-- _agent: interviewer --> as first line of output file', () => {
      const content = readAgent('interviewer.md');
      assert.ok(
        content.includes('<!-- _agent: interviewer -->'),
        'interviewer.md must contain the marker instruction <!-- _agent: interviewer -->'
      );
    });

    it('contains instruction that marker must be the first line before any heading', () => {
      const content = readAgent('interviewer.md');
      assert.ok(
        content.includes('first line') || content.includes('very first line'),
        'interviewer.md must instruct that the marker is the first line of the written file'
      );
    });

    it('does NOT contain "Do NOT write code or modify any files" constraint', () => {
      const content = readAgent('interviewer.md');
      assert.ok(
        !content.includes('Do NOT write code or modify any files'),
        'interviewer.md must NOT contain the "Do NOT write code or modify any files" constraint (it should be removed so the interviewer can write interview-log.md)'
      );
    });

    it('contains instruction to Write .jwforge/current/interview-log.md as an output action', () => {
      const content = readAgent('interviewer.md');
      // Must include a write instruction in the output section, not just an input reference.
      // Look for Write keyword paired with the interview-log.md path in an output context.
      const hasWriteInstruction =
        content.includes('Write `.jwforge/current/interview-log.md`') ||
        content.includes('Write .jwforge/current/interview-log.md') ||
        /Write.*interview-log\.md/.test(content);
      assert.ok(
        hasWriteInstruction,
        'interviewer.md must contain a Write instruction for .jwforge/current/interview-log.md (not just an input reference)'
      );
    });
  });

  describe('reviewer-phase1.md', () => {
    it('contains instruction to add <!-- _agent: reviewer --> as first line of output file', () => {
      const content = readAgent('reviewer-phase1.md');
      assert.ok(
        content.includes('<!-- _agent: reviewer -->'),
        'reviewer-phase1.md must contain the marker instruction <!-- _agent: reviewer -->'
      );
    });

    it('contains instruction that marker must be the first line before any heading', () => {
      const content = readAgent('reviewer-phase1.md');
      assert.ok(
        content.includes('first line') || content.includes('very first line'),
        'reviewer-phase1.md must instruct that the marker is the first line of the written file'
      );
    });
  });

  describe('reviewer-phase2.md', () => {
    it('contains instruction to add <!-- _agent: reviewer --> as first line of output file', () => {
      const content = readAgent('reviewer-phase2.md');
      assert.ok(
        content.includes('<!-- _agent: reviewer -->'),
        'reviewer-phase2.md must contain the marker instruction <!-- _agent: reviewer -->'
      );
    });

    it('contains instruction that marker must be the first line before any heading', () => {
      const content = readAgent('reviewer-phase2.md');
      assert.ok(
        content.includes('first line') || content.includes('very first line'),
        'reviewer-phase2.md must instruct that the marker is the first line of the written file'
      );
    });
  });

  describe('reviewer-phase4.md', () => {
    it('contains instruction to add <!-- _agent: reviewer --> as first line of output file', () => {
      const content = readAgent('reviewer-phase4.md');
      assert.ok(
        content.includes('<!-- _agent: reviewer -->'),
        'reviewer-phase4.md must contain the marker instruction <!-- _agent: reviewer -->'
      );
    });

    it('contains instruction that marker must be the first line before any heading', () => {
      const content = readAgent('reviewer-phase4.md');
      assert.ok(
        content.includes('first line') || content.includes('very first line'),
        'reviewer-phase4.md must instruct that the marker is the first line of the written file'
      );
    });
  });
});
