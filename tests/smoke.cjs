const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const mime = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const requested = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  const file = path.resolve(root, `.${requested}`);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const installedBrowser = [
    chromium.executablePath(),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].find((candidate) => candidate && fs.existsSync(candidate));
  const browser = await chromium.launch({ headless: true, ...(installedBrowser ? { executablePath: installedBrowser } : {}) });
  const errors = [];
  const sizes = [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 768, height: 1024 },
    { width: 430, height: 932 },
    { width: 390, height: 844 }
  ];

  for (const viewport of sizes) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', (error) => errors.push(`${viewport.width}px: ${error.message}`));
    await page.goto(`http://127.0.0.1:${port}/lower-limb/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#dashboard.active-view');
    for (const view of ['learnHub', 'practiceLibrary', 'practicalMode', 'referenceHub', 'bones', 'models', 'muscles', 'labeling', 'practicalLabeling', 'visuals', 'drills', 'differentiation', 'cram']) {
      if (!(await page.locator(`#${view}`).count())) errors.push(`${viewport.width}px: missing ${view} view`);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    if (overflow) errors.push(`${viewport.width}px: horizontal overflow`);
    await page.getByRole('button', { name: /Open progress and backup settings/i }).click();
    await page.waitForSelector('#progressDialog[open]');
    await page.locator('#examDateInput').fill('2026-06-12');
    await page.getByRole('button', { name: 'Save practical date', exact: true }).click();
    const examDate = await page.evaluate(() => JSON.parse(localStorage.getItem('ll_learning_v2')).settings.examDate);
    if (examDate !== '2026-06-12') errors.push(`${viewport.width}px: practical date was not saved`);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Practice', exact: true }).last().click();
    await page.waitForSelector('#practiceLibrary.active-view');
    await page.getByRole('button', { name: /Today's Practice/i }).first().click();
    await page.waitForSelector('#activities.active-view');
    await page.getByRole('button', { name: 'Certain', exact: true }).click();
    await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
    await page.getByRole('button', { name: 'Again', exact: true }).click();
    const attempts = await page.evaluate(() => JSON.parse(localStorage.getItem('ll_learning_v2') || '{"attempts":[]}').attempts.length);
    if (!attempts) errors.push(`${viewport.width}px: practice attempt was not saved`);
    const practiceState = await page.evaluate(() => {
      const practiceItems = Array.from(document.querySelectorAll('button.nav-item'))
        .filter((node) => node.textContent.trim() === 'Practice');
      const visiblePracticeItems = practiceItems.filter((node) => {
        const style = getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length;
      });
      return {
        navGroup: document.body.dataset.navGroup,
        visiblePracticeActive: visiblePracticeItems.some((node) => node.classList.contains('active'))
      };
    });
    if (practiceState.navGroup !== 'practice') errors.push(`${viewport.width}px: Practice navigation state is not active during an activity`);
    if (practiceState.visiblePracticeActive === false && viewport.width > 680) errors.push(`${viewport.width}px: visible Practice navigation is not active during an activity`);
    if (viewport.width <= 680) {
      await page.goto(`http://127.0.0.1:${port}/lower-limb/index.html?viewport=${viewport.width}#bones`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#bones.active-view .data-table');
      const mobileTable = await page.evaluate(() => {
        const table = document.querySelector('#bones .data-table');
        const wrapper = table?.closest('.table-wrap');
        return {
          pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          tableWidth: table?.getBoundingClientRect().width || 0,
          wrapperWidth: wrapper?.clientWidth || 0,
          stickyPosition: getComputedStyle(document.querySelector('.sticky-frame')).position
        };
      });
      if (mobileTable.pageOverflows) errors.push(`${viewport.width}px: lower-limb mobile page has horizontal overflow outside the table`);
      if (mobileTable.tableWidth < 700 || mobileTable.tableWidth <= mobileTable.wrapperWidth) {
        errors.push(`${viewport.width}px: lower-limb anatomy table is still compressing columns instead of scrolling`);
      }
      if (mobileTable.stickyPosition === 'sticky') errors.push(`${viewport.width}px: lower-limb mobile top bar still consumes persistent screen space`);
    }
    await page.close();
  }

  const landingPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  landingPage.on('pageerror', (error) => errors.push(`course menu: ${error.message}`));

  const activityLinksPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  activityLinksPage.on('pageerror', (error) => errors.push(`activity links: ${error.message}`));
  await activityLinksPage.goto(`http://127.0.0.1:${port}/activity-links.html`, { waitUntil: 'domcontentloaded' });
  const activityLinks = await activityLinksPage.locator('.section-card a').evaluateAll((links) => links.map((link) => ({
    href: link.getAttribute('href'),
    label: link.textContent.trim()
  })));
  if (activityLinks.length !== 48) errors.push(`activity links: expected 48 direct activity links, found ${activityLinks.length}`);
  if (new Set(activityLinks.map((link) => link.href)).size !== activityLinks.length) {
    errors.push('activity links: duplicate activity destination');
  }
  for (const [linkIndex, link] of activityLinks.entries()) {
    const destination = new URL(link.href, `http://127.0.0.1:${port}/activity-links.html`);
    destination.searchParams.set('link-check', String(linkIndex));
    const response = await activityLinksPage.goto(destination.href, { waitUntil: 'domcontentloaded' });
    if (response && !response.ok()) {
      errors.push(`activity links: ${link.label} returned ${response.status()}`);
      continue;
    }
    const viewId = destination.hash.replace(/^#/, '');
    if (!viewId) {
      errors.push(`activity links: ${link.label} is missing a destination view`);
      continue;
    }
    try {
      await activityLinksPage.waitForSelector(`#${viewId}.active-view`, { timeout: 5000 });
    } catch {
      errors.push(`activity links: ${link.label} did not open ${viewId}`);
      continue;
    }
    if (destination.searchParams.has('activity')) {
      const expectedTitle = link.label.replaceAll('\u2019', "'");
      const activityText = (await activityLinksPage.locator(`#${viewId}`).innerText()).replaceAll('\u2019', "'");
      if (!activityText.includes(expectedTitle)) errors.push(`activity links: ${link.label} did not display its activity title`);
    } else if (destination.searchParams.has('drill')) {
      const visibleTitle = (await activityLinksPage.locator('#drillModeTitle').textContent() || '').trim().replaceAll('\u2019', "'");
      const expectedTitle = link.label.replaceAll('\u2019', "'");
      if (visibleTitle !== expectedTitle) errors.push(`activity links: ${link.label} opened ${visibleTitle || 'an untitled mode'}`);
    }
  }
  await activityLinksPage.close();

  await landingPage.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  if (await landingPage.getByText('Rough draft', { exact: true }).count()) {
    errors.push('course menu: Axial still displays Rough draft');
  }
  const landingCopy = await landingPage.locator('body').innerText();
  const landingMeta = await landingPage.evaluate(() => ({
    heading: document.querySelector('h1')?.textContent.trim() || '',
    availableTags: Array.from(document.querySelectorAll('.practical-topline')).filter((node) => node.textContent.includes('Available')).length,
    textbookHref: document.querySelector('.textbook-link')?.href || '',
    emailHref: document.querySelector('footer a[href^="mailto:"]')?.getAttribute('href') || '',
    makerMark: document.querySelector('.maker-mark')?.getAttribute('aria-label') || ''
  }));
  if (landingMeta.heading !== 'BIO 2230 Practical Prep') {
    errors.push('course menu: landing heading was not simplified');
  }
  if (!landingCopy.includes('BIO 2230 is taught by multiple professors')) {
    errors.push('course menu: missing multi-professor course clarification');
  }
  if (!landingCopy.includes("This site supports the lab practicals for Dr. Beckermann's Anatomy & Physiology I sections")) {
    errors.push('course menu: missing Dr. Beckermann section scope');
  }
  if (!landingCopy.includes("Verify all information and requirements against your section's Canvas course and lab instructions")) {
    errors.push('course menu: missing course-expectations verification reminder');
  }
  if (!landingCopy.includes('Choose your current study region')) {
    errors.push('course menu: missing sequence-neutral region choice');
  }
  if (!landingCopy.includes('Progress is saved in this browser') || !landingCopy.includes('How to clear saved progress')) {
    errors.push('course menu: missing saved-progress and reset guidance');
  }
  if (landingCopy.includes('3\nStudy regions') || landingCopy.includes('16\nActivities per region')) {
    errors.push('course menu: removed landing-page counts are still visible');
  }
  if (landingCopy.includes("Follow the sequence assigned in Dr. Beckermann's Canvas course")) {
    errors.push('course menu: removed Canvas sequence instruction is still visible');
  }
  if (landingMeta.availableTags) errors.push('course menu: study-region Available tags are still visible');
  if (landingMeta.textbookHref !== 'https://www.pearson.com/en-us/subject-catalog/p/fundamentals-of-anatomy-and-physiology/P200000009819/9780137854011') {
    errors.push('course menu: textbook attribution does not link to the official Pearson edition');
  }
  if (landingMeta.emailHref !== 'mailto:tom.beckermann@belmont.edu?subject=BIO%202230%20Study%20Site') {
    errors.push('course menu: support email is missing the BIO 2230 Study Site subject');
  }
  if (!landingCopy.includes("BIO 2230 · Dr. Beckermann's Practical Prep") || landingMeta.makerMark !== 'Built by Beckermann') {
    errors.push('course menu: revised footer branding is incomplete');
  }
  if (/Practical 0[123]/.test(landingCopy)) {
    errors.push('course menu: study regions are still numbered as a universal sequence');
  }
  for (const section of ['upper-limb', 'axial']) {
    await landingPage.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    const linkCount = await landingPage.locator(`a[href="${section}/index.html"]`).count();
    if (!linkCount) errors.push(`course menu: missing ${section} link`);
    await landingPage.goto(`http://127.0.0.1:${port}/${section}/index.html`, { waitUntil: 'domcontentloaded' });
    await landingPage.waitForSelector('#dashboard.active-view');
    const accessibility = await landingPage.evaluate(() => ({
      searchLabel: document.querySelector('#globalSearch')?.getAttribute('aria-label') || '',
      primaryNavItems: document.querySelectorAll('#studyNav > .nav-item').length,
      hasMoreTools: Boolean(document.querySelector('#studyNav > .nav-more')),
      recommendedSteps: document.querySelectorAll('.recommended-path > div').length
    }));
    if (!accessibility.searchLabel) errors.push(`${section}: search is missing an accessible label`);
    if (accessibility.primaryNavItems !== 5) errors.push(`${section}: expected five primary navigation choices`);
    if (!accessibility.hasMoreTools) errors.push(`${section}: missing More study tools disclosure`);
    if (accessibility.recommendedSteps !== 4) errors.push(`${section}: recommended study path is incomplete`);

    await landingPage.locator('[data-plan-activity-mode="region"]').first().click();
    await landingPage.waitForSelector('#regionDrill.active-view .hug-drill-image-card img');
    const drillAlt = await landingPage.locator('.hug-drill-image-card img').getAttribute('alt');
    if (drillAlt !== 'Anatomy image with one structure highlighted') {
      errors.push(`${section}: image drill alternative text reveals or omits the prompt context`);
    }

    await landingPage.locator('[data-hug-action="practice-library"]').first().click();
    await landingPage.waitForSelector('#practiceLibrary.active-view');
    await landingPage.locator('[data-plan-activity-mode="flashcards"]').first().click();
    await landingPage.waitForSelector('#flashcards.active-view #hugFlashCard');
    const hiddenAnswer = await landingPage.locator('.hug-flashcard-back').getAttribute('aria-hidden');
    if (hiddenAnswer !== 'true') errors.push(`${section}: unflipped flashcard answer is exposed to assistive technology`);
    await landingPage.locator('#hugFlashCard').click();
    const shownAnswer = await landingPage.locator('.hug-flashcard-back').getAttribute('aria-hidden');
    const hiddenPrompt = await landingPage.locator('.hug-flashcard-front').getAttribute('aria-hidden');
    if (shownAnswer !== 'false' || hiddenPrompt !== 'true') errors.push(`${section}: flashcard accessibility state does not follow the visible face`);

    await landingPage.setViewportSize({ width: 390, height: 844 });
    await landingPage.goto(`http://127.0.0.1:${port}/${section}/index.html?mobile-check=1#bones`, { waitUntil: 'domcontentloaded' });
    await landingPage.waitForSelector('#bones.active-view .data-table');
    const mobileLayout = await landingPage.evaluate(() => {
      const table = document.querySelector('#bones .data-table');
      const wrapper = table?.closest('.table-wrap');
      const stickyFrame = document.querySelector('.sticky-frame');
      return {
        pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        tableWidth: table?.getBoundingClientRect().width || 0,
        wrapperWidth: wrapper?.clientWidth || 0,
        stickyPosition: stickyFrame ? getComputedStyle(stickyFrame).position : ''
      };
    });
    if (mobileLayout.pageOverflows) errors.push(`${section}: mobile page has horizontal overflow outside the table`);
    if (mobileLayout.tableWidth < 700 || mobileLayout.tableWidth <= mobileLayout.wrapperWidth) {
      errors.push(`${section}: mobile anatomy table is still compressing columns instead of scrolling`);
    }
    if (mobileLayout.stickyPosition === 'sticky') errors.push(`${section}: mobile top bar still consumes persistent screen space`);
    if (await landingPage.locator('.sidebar').getAttribute('aria-hidden') !== 'true') {
      errors.push(`${section}: closed mobile study menu remains exposed to assistive technology`);
    }
    await landingPage.locator('#libraryNavToggle').click();
    if (await landingPage.locator('.sidebar').getAttribute('aria-hidden') !== 'false') {
      errors.push(`${section}: open mobile study menu is hidden from assistive technology`);
    }
    await landingPage.setViewportSize({ width: 1280, height: 800 });
  }

  for (const section of ['lower-limb', 'upper-limb', 'axial']) {
    await landingPage.goto(`http://127.0.0.1:${port}/${section}/index.html#models`, { waitUntil: 'domcontentloaded' });
    await landingPage.waitForSelector('#models.active-view #modelSourceSummary .model-source-key');
    const modelPage = await landingPage.evaluate(() => ({
      header: Array.from(document.querySelectorAll('#modelKeyTable th')).map((node) => node.textContent.trim()),
      summary: document.querySelector('#modelSourceSummary')?.textContent || '',
      stats: window.STUDY_DATA.modelImageBankStats,
      profile: window.STUDY_DATA.modelAssessmentProfile,
      contexts: window.STUDY_DATA.modelKey.map((row) => ({ item: row.item, context: row.assessmentContext })),
      stringBankEntries: window.STUDY_DATA.modelKey.flatMap((row) => row.images).filter((item) => typeof item === 'string').length
    }));
    if (!modelPage.header.includes('Practice image bank')) errors.push(`${section}: model table still labels repository images as lab images`);
    if (!modelPage.summary.includes('PAL atlas substitute') || !modelPage.summary.includes('No Belmont lab-model photos are currently claimed')) {
      errors.push(`${section}: model image provenance summary is incomplete`);
    }
    if (modelPage.stats.sourceCounts['lab-model-photo'] !== 0) errors.push(`${section}: fabricated lab-model source count`);
    if (modelPage.stringBankEntries) errors.push(`${section}: model image bank entries are missing provenance metadata`);
    if (!modelPage.profile?.summary || !modelPage.summary.includes(modelPage.profile.summary)) {
      errors.push(`${section}: assessment-specific model plan is not visible on the model-ID page`);
    }
    const expectedContextCounts = {
      'lower-limb': { 'single-leg-model': 26, 'arm-model': 0, 'face-image': 0, 'torso-fallback': 0 },
      'upper-limb': { 'single-leg-model': 0, 'arm-model': 24, 'face-image': 0, 'torso-fallback': 5 },
      axial: { 'single-leg-model': 0, 'arm-model': 0, 'face-image': 10, 'torso-fallback': 7 }
    }[section];
    if (JSON.stringify(modelPage.stats.contextCounts) !== JSON.stringify(expectedContextCounts)) {
      errors.push(`${section}: model assessment context counts are incorrect`);
    }

    await landingPage.goto(`http://127.0.0.1:${port}/${section}/index.html?model-practical-check=1#practicalMode`, { waitUntil: 'domcontentloaded' });
    await landingPage.waitForSelector('#practicalMode.active-view #startPracticalMode');
    const practicalCheck = await landingPage.evaluate(() => {
      const types = ['sticker', 'leftRight', 'model', 'oia'];
      const cards = practicalModeSourceCards(types);
      const selected = balancedPracticalOrder(cards, 10, types).map((index) => cards[index]);
      const counts = Object.fromEntries(types.map((type) => [type, selected.filter((card) => card.practicalType === type).length]));
      const modelCards = selected.filter((card) => card.practicalType === 'model');
      return {
        counts,
        modelSamplingKeys: modelCards.map((card) => card.samplingKey),
        modelSources: modelCards.map((card) => ({
          sourceKind: card.sourceKind,
          sourceTypeLabel: card.sourceTypeLabel,
          sourceDescription: card.sourceDescription
        })),
        setupText: document.querySelector('#practicalModeRoot')?.textContent || ''
      };
    });
    const balancedCounts = Object.values(practicalCheck.counts);
    if (Math.max(...balancedCounts) - Math.min(...balancedCounts) > 1) {
      errors.push(`${section}: ten-question mixed practical was not balanced across the four selected types`);
    }
    if (practicalCheck.counts.model > Math.ceil(10 / 4)) {
      errors.push(`${section}: muscle ID was over-weighted in the mixed practical`);
    }
    if (new Set(practicalCheck.modelSamplingKeys).size !== practicalCheck.modelSamplingKeys.length) {
      errors.push(`${section}: mixed practical repeated a muscle before using distinct model-ID structures`);
    }
    if (practicalCheck.modelSources.some((source) => source.sourceKind !== 'pal-atlas-substitute' || source.sourceTypeLabel !== 'PAL atlas substitute' || !source.sourceDescription.includes('not a Belmont lab-model photo'))) {
      errors.push(`${section}: muscle-ID practical question hides or misstates image provenance`);
    }
    if (!practicalCheck.setupText.includes('Extra image views do not give muscle ID extra weight')) {
      errors.push(`${section}: practical setup does not explain balanced image-bank sampling`);
    }
  }
  await landingPage.close();

  const filePage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  filePage.on('pageerror', (error) => errors.push(`file URL: ${error.message}`));
  filePage.on('console', (message) => {
    if (message.type() === 'error') errors.push(`file URL console: ${message.text()}`);
  });
  await filePage.goto(pathToFileURL(path.join(root, 'lower-limb', 'index.html')).href, { waitUntil: 'domcontentloaded' });
  await filePage.waitForSelector('#dashboard.active-view');
  await filePage.getByRole('button', { name: 'Reference', exact: true }).last().click();
  await filePage.waitForSelector('#referenceHub.active-view');
  await filePage.close();

  await browser.close();
  server.close();
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Desktop and mobile smoke checks passed.');
})().catch((error) => {
  server.close();
  console.error(error);
  process.exitCode = 1;
});
