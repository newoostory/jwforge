import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = new URL('..', import.meta.url).pathname;
const TEMPLATE_PATH = join(PROJECT_ROOT, 'templates', 'compact-snapshot.md');

const content = readFileSync(TEMPLATE_PATH, 'utf8');

describe('compact-snapshot.md template', () => {
  describe('structure', () => {
    it('contains a "Resume Instructions" section', () => {
      assert.ok(
        content.includes('## Resume Instructions'),
        'compact-snapshot.md must contain a "## Resume Instructions" section'
      );
    });

    it('preserves HTML comments', () => {
      assert.ok(
        content.includes('<!--'),
        'compact-snapshot.md must contain HTML comments (<!-- ... -->)'
      );
    });
  });

  describe('existing items 1-5 (regression)', () => {
    it('contains item 1: read state.json', () => {
      assert.ok(
        content.includes('Read `.jwforge/current/state.json`'),
        'item 1 must instruct reading state.json'
      );
    });

    it('contains item 2: read task-spec.md', () => {
      assert.ok(
        content.includes('Read `.jwforge/current/task-spec.md`'),
        'item 2 must instruct reading task-spec.md'
      );
    });

    it('contains item 3: read architecture.md', () => {
      assert.ok(
        content.includes('Read `.jwforge/current/architecture.md`'),
        'item 3 must instruct reading architecture.md'
      );
    });

    it('contains item 4: resume at phase placeholder', () => {
      assert.ok(
        content.includes('Resume at phase'),
        'item 4 must instruct resuming at a specific phase'
      );
    });

    it('contains item 5: resume_note placeholder', () => {
      assert.ok(
        content.includes('{{resume_note}}'),
        'item 5 must contain the {{resume_note}} placeholder'
      );
    });
  });

  describe('new item 6: state-recorder protocol', () => {
    it('contains item 6 about state-recorder protocol', () => {
      assert.ok(
        content.includes('state-recorder'),
        'item 6 must mention state-recorder'
      );
    });

    it('item 6 states that state.json writes must go through state-recorder', () => {
      const hasStatejsonMention = content.includes('state.json');
      const hasStateRecorder = content.includes('state-recorder');
      assert.ok(
        hasStatejsonMention && hasStateRecorder,
        'item 6 must mention both state.json and state-recorder'
      );
    });

    it('item 6 prohibits writing state.json directly', () => {
      assert.ok(
        content.includes('NEVER write state.json directly') ||
        content.includes('NEVER write state.json') ||
        /NEVER.*state\.json/.test(content),
        'item 6 must instruct to NEVER write state.json directly'
      );
    });
  });

  describe('new item 7: artifact ownership', () => {
    it('contains item 7 about artifact ownership', () => {
      assert.ok(
        content.includes('designated agent') || content.includes('designated agents'),
        'item 7 must mention designated agents for artifact ownership'
      );
    });

    it('item 7 mentions agent artifacts (task-spec.md, architecture.md, etc.)', () => {
      const hasTaskSpec = content.includes('task-spec.md');
      const hasArchitecture = content.includes('architecture.md');
      assert.ok(
        hasTaskSpec && hasArchitecture,
        'item 7 must mention artifact files like task-spec.md and architecture.md'
      );
    });

    it('item 7 prohibits writing artifacts outside designated agent', () => {
      assert.ok(
        /NEVER write them/.test(content) ||
        /NEVER write.*artifact/.test(content) ||
        content.includes('NEVER write them yourself'),
        'item 7 must instruct to NEVER write agent artifacts yourself'
      );
    });
  });

  describe('new item 8: user gates', () => {
    it('contains item 8 about user gates for phase transitions', () => {
      assert.ok(
        content.includes('waiting_for_user'),
        'item 8 must mention waiting_for_user flag'
      );
    });

    it('item 8 mentions Phase 2->3 transition requiring user approval', () => {
      assert.ok(
        content.includes('2->3') || content.includes('Phase 2') || content.includes('2 to 3'),
        'item 8 must mention Phase 2->3 transition'
      );
    });

    it('item 8 mentions Phase 3->4 transition requiring user approval', () => {
      assert.ok(
        content.includes('3->4') || content.includes('Phase 3') || content.includes('3 to 4'),
        'item 8 must mention Phase 3->4 transition'
      );
    });

    it('item 8 instructs setting waiting_for_user via state-recorder', () => {
      assert.ok(
        content.includes('waiting_for_user') && content.includes('state-recorder'),
        'item 8 must instruct setting waiting_for_user via state-recorder'
      );
    });
  });

  describe('new item 9: no code before design', () => {
    it('contains item 9 about no code before design', () => {
      assert.ok(
        content.includes('Phase 1') || content.includes('design-only'),
        'item 9 must mention Phase 1-2 being design-only'
      );
    });

    it('item 9 prohibits writing project source files during Phase 1-2', () => {
      assert.ok(
        content.includes('Do NOT write project source files') ||
        content.includes('do not write project source files') ||
        /NOT write.*source files/.test(content) ||
        /NOT write.*project/.test(content),
        'item 9 must prohibit writing project source files during Phase 1-2'
      );
    });

    it('item 9 mentions Phase 3 as when implementation is allowed', () => {
      assert.ok(
        content.includes('Phase 3') || content.includes('until Phase 3'),
        'item 9 must reference Phase 3 as the point where coding begins'
      );
    });
  });

  describe('ordering: items 6-9 appear after item 5', () => {
    it('items 6-9 appear after the {{resume_note}} placeholder (item 5)', () => {
      const item5Index = content.indexOf('{{resume_note}}');
      assert.ok(item5Index !== -1, '{{resume_note}} placeholder (item 5) must exist');

      // At least one new item keyword should appear after item 5
      const afterItem5 = content.slice(item5Index);
      assert.ok(
        afterItem5.includes('state-recorder') || afterItem5.includes('designated agent') ||
        afterItem5.includes('waiting_for_user') || afterItem5.includes('design-only'),
        'items 6-9 content must appear after item 5 ({{resume_note}})'
      );
    });
  });
});
