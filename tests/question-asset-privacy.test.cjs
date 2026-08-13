const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const sections = ['lower-limb', 'upper-limb', 'axial'];

function loadSection(section) {
  const context = { window: {} };
  vm.createContext(context);
  for (const file of ['data.js', 'visual-data.js', 'muscle-visual-data.js']) {
    const source = path.join(root, section, file);
    if (fs.existsSync(source)) vm.runInContext(fs.readFileSync(source, 'utf8'), context, { filename: source });
  }
  return context.window.STUDY_DATA;
}

function reviewPaths(card) {
  if (Array.isArray(card.reviewImages) && card.reviewImages.length) {
    return card.reviewImages.map((entry) => entry.image || entry.reviewImage).filter(Boolean);
  }
  return card.reviewImage ? [card.reviewImage] : [];
}

for (const section of sections) {
  const data = loadSection(section);
  const paths = new Set();
  for (const field of ['boneLeaderCards', 'muscleImageCards', 'practicalLabelingCards', 'leftRightImages']) {
    for (const card of data[field] || []) reviewPaths(card).forEach((value) => paths.add(value));
  }
  assert.ok(paths.size, `${section}: expected question assets`);
  for (const image of paths) {
    assert.match(path.posix.basename(image), /^q-[0-9a-f]{12}\.[a-z0-9]+$/i, `${section}: answer-revealing question filename ${image}`);
    assert.ok(fs.existsSync(path.join(root, section, ...image.split('/'))), `${section}: missing question asset ${image}`);
  }
}

console.log('Question asset filename privacy tests passed.');
