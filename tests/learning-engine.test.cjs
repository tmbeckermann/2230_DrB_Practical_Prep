const assert = require('node:assert/strict');
const path = require('node:path');
const LearningEngine = require(path.join(__dirname, '..', 'lower-limb', 'learning-engine.js'));

class MemoryStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
  }
  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
  removeItem(key) {
    this.values.delete(key);
  }
}

const variants = [
  { conceptId: 'bone:ilium', variantId: 'bone-image-ilium', mode: 'retrieval' },
  { conceptId: 'bone:ilium', variantId: 'hotspot-ilium', mode: 'hotspot' },
  { conceptId: 'oia:sartorius', variantId: 'oia-bank-sartorius', mode: 'oia' },
  { conceptId: 'muscle-id:sartorius', variantId: 'model-sartorius', mode: 'model' }
];

function engineAt(initial = {}) {
  const storage = new MemoryStorage(initial);
  const engine = LearningEngine.create({ storage, variants });
  engine.loadAndMigrate();
  return { engine, storage };
}

{
  const { engine } = engineAt({
    ll_checked: JSON.stringify({ 'bone:ilium': true }),
    ll_drill: JSON.stringify({ 'bone-image-ilium': 'missed', 'oia-bank-sartorius': 'correct' })
  });
  assert.equal(engine.getStore().coverage['bone:ilium'], true, 'legacy coverage migrates');
  assert.equal(engine.getConcept('bone:ilium').lastResult, 'again', 'legacy misses migrate as due');
  assert.equal(engine.getConcept('oia:sartorius').ready, false, 'legacy correct status is not mastery');
}

{
  const { engine } = engineAt();
  const day1 = '2026-06-01T12:00:00.000Z';
  const day2 = '2026-06-02T12:00:00.000Z';
  const day3 = '2026-06-05T12:00:00.000Z';
  engine.recordAttempt({ conceptId: 'bone:ilium', variantId: 'bone-image-ilium', mode: 'retrieval', result: 'good', timestamp: day1 });
  assert.equal(engine.getConcept('bone:ilium').stage, 1);
  engine.recordAttempt({ conceptId: 'bone:ilium', variantId: 'hotspot-ilium', mode: 'hotspot', result: 'good', timestamp: day2 });
  engine.recordAttempt({ conceptId: 'bone:ilium', variantId: 'bone-image-ilium', mode: 'retrieval', result: 'good', timestamp: day3 });
  assert.equal(engine.getConcept('bone:ilium').ready, true, 'three separated days plus varied evidence produces readiness');
  engine.recordAttempt({ conceptId: 'bone:ilium', variantId: 'hotspot-ilium', mode: 'hotspot', result: 'again', timestamp: '2026-06-06T12:00:00.000Z' });
  assert.equal(engine.getConcept('bone:ilium').ready, false, 'a miss removes readiness');
}

{
  const { engine } = engineAt();
  const now = '2026-06-05T12:00:00.000Z';
  engine.recordAttempt({ conceptId: 'bone:ilium', variantId: 'bone-image-ilium', mode: 'retrieval', result: 'again', timestamp: now });
  const queue = engine.buildTodayQueue(variants, { now, limit: 3, maxNew: 2 });
  assert.equal(queue[0].conceptId, 'bone:ilium', 'missed concepts lead the due queue');
  assert.ok(queue.filter((item) => !engine.getConcept(item.conceptId)).length <= 2, 'new concepts are capped');
}

{
  const { engine } = engineAt();
  engine.setExamDate('2026-06-08');
  engine.recordAttempt({
    conceptId: 'bone:ilium',
    variantId: 'bone-image-ilium',
    mode: 'retrieval',
    result: 'good',
    timestamp: '2026-06-07T12:00:00.000Z'
  });
  assert.ok(engine.getConcept('bone:ilium').dueAt <= new Date('2026-06-08T08:00:00').getTime(), 'reviews are capped before the exam');
  const backup = engine.exportProgress();
  const restored = engine.importProgress(backup);
  assert.equal(restored.settings.examDate, '2026-06-08', 'backup round-trip preserves settings');
  assert.throws(() => engine.importProgress('{}'), /unsupported version/, 'invalid backups are rejected');
}

console.log('Learning engine tests passed.');
