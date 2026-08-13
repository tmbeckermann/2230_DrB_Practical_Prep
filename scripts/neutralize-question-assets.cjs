const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const sections = ['lower-limb', 'upper-limb', 'axial'];
const dataFiles = ['data.js', 'visual-data.js', 'muscle-visual-data.js'];
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.mjs', '.cjs']);

function loadSection(section) {
  const context = { window: {} };
  vm.createContext(context);
  for (const file of dataFiles) {
    const source = path.join(root, section, file);
    if (fs.existsSync(source)) {
      vm.runInContext(fs.readFileSync(source, 'utf8'), context, { filename: source });
    }
  }
  return context.window.STUDY_DATA;
}

function reviewPaths(card) {
  if (Array.isArray(card.reviewImages) && card.reviewImages.length) {
    return card.reviewImages.map((entry) => entry.image || entry.reviewImage).filter(Boolean);
  }
  return card.reviewImage ? [card.reviewImage] : [];
}

function questionPaths(data) {
  const paths = new Set();
  for (const field of ['boneLeaderCards', 'muscleImageCards', 'practicalLabelingCards', 'leftRightImages']) {
    for (const card of data[field] || []) {
      reviewPaths(card).forEach((value) => paths.add(value));
    }
  }
  return paths;
}

function textFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'assets') continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...textFiles(fullPath));
    else if (textExtensions.has(path.extname(entry.name).toLowerCase())) files.push(fullPath);
  }
  return files;
}

let moved = 0;
for (const section of sections) {
  const sectionRoot = path.join(root, section);
  const replacements = new Map();
  for (const oldPath of questionPaths(loadSection(section))) {
    const basename = path.posix.basename(oldPath);
    if (/^q-[0-9a-f]{12}\.[a-z0-9]+$/i.test(basename)) continue;
    const extension = path.extname(basename).toLowerCase();
    const id = crypto.createHash('sha256').update(`${section}/${oldPath}`).digest('hex').slice(0, 12);
    const newPath = `assets/questions/q-${id}${extension}`;
    const oldFullPath = path.join(sectionRoot, ...oldPath.split('/'));
    const newFullPath = path.join(sectionRoot, ...newPath.split('/'));
    if (!fs.existsSync(oldFullPath)) throw new Error(`Missing question asset: ${section}/${oldPath}`);
    if (fs.existsSync(newFullPath)) throw new Error(`Question asset collision: ${section}/${newPath}`);
    replacements.set(oldPath, newPath);
  }

  for (const file of textFiles(sectionRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    let updated = source;
    for (const [oldPath, newPath] of replacements) updated = updated.split(oldPath).join(newPath);
    if (updated !== source) fs.writeFileSync(file, updated);
  }

  const questionDirectory = path.join(sectionRoot, 'assets', 'questions');
  if (replacements.size) fs.mkdirSync(questionDirectory, { recursive: true });
  for (const [oldPath, newPath] of replacements) {
    const oldFullPath = path.join(sectionRoot, ...oldPath.split('/'));
    const newFullPath = path.join(sectionRoot, ...newPath.split('/'));
    fs.renameSync(oldFullPath, newFullPath);
    moved += 1;
  }
  console.log(`${section}: ${replacements.size} question assets neutralized`);
}

console.log(`Total: ${moved} question assets neutralized`);
