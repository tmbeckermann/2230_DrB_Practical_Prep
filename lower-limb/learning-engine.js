(function initLearningEngine(globalScope) {
  'use strict';

  const STORAGE_KEY = 'll_learning_v2';
  const VERSION = 2;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MAX_ATTEMPTS = 2000;

  function parseJson(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function dateKey(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }

  function startOfDay(value) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  function addDays(value, days) {
    return startOfDay(value) + (days * DAY_MS);
  }

  function normalizeResult(result) {
    if (result === 'again' || result === 'missed' || result === 'unsure') return 'again';
    if (result === 'hard') return 'hard';
    return 'good';
  }

  function emptyStore(now = Date.now()) {
    return {
      version: VERSION,
      updatedAt: new Date(now).toISOString(),
      migratedAt: '',
      coverage: {},
      concepts: {},
      attempts: [],
      settings: {
        examDate: ''
      }
    };
  }

  function normalizeStore(raw, now = Date.now()) {
    const base = emptyStore(now);
    if (!raw || typeof raw !== 'object' || Number(raw.version) !== VERSION) return base;
    return {
      ...base,
      ...raw,
      coverage: raw.coverage && typeof raw.coverage === 'object' ? raw.coverage : {},
      concepts: raw.concepts && typeof raw.concepts === 'object' ? raw.concepts : {},
      attempts: Array.isArray(raw.attempts) ? raw.attempts.slice(-MAX_ATTEMPTS) : [],
      settings: {
        ...base.settings,
        ...(raw.settings && typeof raw.settings === 'object' ? raw.settings : {})
      }
    };
  }

  function validateImport(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('The selected file does not contain progress data.');
    if (Number(raw.version) !== VERSION) throw new Error('This progress backup uses an unsupported version.');
    if (!raw.coverage || typeof raw.coverage !== 'object') throw new Error('The progress backup is missing coverage data.');
    if (!raw.concepts || typeof raw.concepts !== 'object') throw new Error('The progress backup is missing mastery data.');
    if (!Array.isArray(raw.attempts)) throw new Error('The progress backup is missing attempt history.');
    return true;
  }

  function availableEvidenceCount(variants, conceptId) {
    const evidence = new Set(
      variants
        .filter((variant) => variant.conceptId === conceptId)
        .map((variant) => `${variant.mode || 'practice'}:${variant.variantId || variant.id || ''}`)
    );
    return evidence.size;
  }

  function recordTemplate() {
    return {
      stage: 0,
      dueAt: 0,
      ready: false,
      lastResult: 'new',
      lastAttemptAt: '',
      lastVariantId: '',
      lastMode: '',
      correctDates: [],
      variants: [],
      modes: [],
      attempts: 0,
      lapses: 0
    };
  }

  function variantForConcept(variants, conceptId, record) {
    const choices = variants.filter((variant) => variant.conceptId === conceptId);
    if (!choices.length) return null;
    const fresh = choices.filter((variant) => (variant.variantId || variant.id) !== record?.lastVariantId);
    const pool = fresh.length ? fresh : choices;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function create(options = {}) {
    const storage = options.storage || globalScope.localStorage;
    let variants = Array.isArray(options.variants) ? options.variants : [];
    let store = emptyStore();

    function save() {
      store.updatedAt = new Date().toISOString();
      storage.setItem(STORAGE_KEY, JSON.stringify(store));
      return store;
    }

    function migrateLegacy(now = Date.now()) {
      if (store.migratedAt) return false;
      const checked = parseJson(storage.getItem('ll_checked'), {});
      const drill = parseJson(storage.getItem('ll_drill'), {});
      Object.entries(checked).forEach(([key, value]) => {
        if (value) store.coverage[key] = true;
      });
      Object.entries(drill).forEach(([variantId, status]) => {
        if (status !== 'correct' && status !== 'missed') return;
        const variant = variants.find((item) => (item.variantId || item.id) === variantId);
        const conceptId = variant?.conceptId || `legacy:${variantId}`;
        const record = { ...recordTemplate(), ...(store.concepts[conceptId] || {}) };
        record.lastResult = status === 'missed' ? 'again' : 'good';
        record.dueAt = status === 'missed' ? now : addDays(now, 1);
        record.attempts = Math.max(1, Number(record.attempts || 0));
        record.lastAttemptAt = new Date(now).toISOString();
        record.lastVariantId = variantId;
        record.lastMode = variant?.mode || 'legacy';
        record.variants = [...new Set([...(record.variants || []), variantId])];
        record.modes = [...new Set([...(record.modes || []), record.lastMode])];
        store.concepts[conceptId] = record;
      });
      store.migratedAt = new Date(now).toISOString();
      save();
      return true;
    }

    function loadAndMigrate() {
      store = normalizeStore(parseJson(storage.getItem(STORAGE_KEY), null));
      migrateLegacy();
      return store;
    }

    function setVariants(nextVariants) {
      variants = Array.isArray(nextVariants) ? nextVariants : [];
      return variants;
    }

    function setCoverage(key, value) {
      if (value) store.coverage[key] = true;
      else delete store.coverage[key];
      save();
    }

    function setExamDate(value) {
      const valid = value && !Number.isNaN(new Date(`${value}T12:00:00`).getTime()) ? value : '';
      store.settings.examDate = valid;
      save();
      return valid;
    }

    function recordAttempt(attempt) {
      if (!attempt?.conceptId) throw new Error('A conceptId is required to record an attempt.');
      const timestamp = attempt.timestamp ? new Date(attempt.timestamp).getTime() : Date.now();
      const result = normalizeResult(attempt.result);
      const record = { ...recordTemplate(), ...(store.concepts[attempt.conceptId] || {}) };
      const variantId = attempt.variantId || attempt.conceptId;
      const mode = attempt.mode || 'practice';
      const today = dateKey(timestamp);

      record.attempts += 1;
      record.lastAttemptAt = new Date(timestamp).toISOString();
      record.lastResult = result;
      record.lastVariantId = variantId;
      record.lastMode = mode;
      record.variants = [...new Set([...(record.variants || []), variantId])];
      record.modes = [...new Set([...(record.modes || []), mode])];

      if (result === 'again') {
        record.stage = Math.max(0, record.stage - 1);
        record.dueAt = timestamp;
        record.lapses += 1;
        record.ready = false;
      } else if (result === 'hard') {
        record.dueAt = addDays(timestamp, 1);
      } else {
        record.stage = Math.min(3, record.stage + 1);
        record.correctDates = [...new Set([...(record.correctDates || []), today])];
        const interval = [1, 1, 3, 7][record.stage] || 7;
        record.dueAt = addDays(timestamp, interval);
        const evidenceAvailable = attempt.availableEvidenceCount ?? availableEvidenceCount(variants, attempt.conceptId);
        const variedEvidence = evidenceAvailable < 2 || record.variants.length >= 2 || record.modes.length >= 2;
        record.ready = record.correctDates.length >= 3 && variedEvidence;
      }

      const examDate = store.settings.examDate;
      if (examDate && record.dueAt) {
        const examAt = new Date(`${examDate}T08:00:00`).getTime();
        if (!Number.isNaN(examAt) && record.dueAt > examAt) record.dueAt = examAt;
      }

      store.concepts[attempt.conceptId] = record;
      store.attempts.push({
        conceptId: attempt.conceptId,
        variantId,
        mode,
        result,
        confidence: attempt.confidence || '',
        timestamp: new Date(timestamp).toISOString()
      });
      store.attempts = store.attempts.slice(-MAX_ATTEMPTS);
      save();
      return record;
    }

    function buildTodayQueue(nextVariants = variants, options = {}) {
      const now = options.now ? new Date(options.now).getTime() : Date.now();
      const limit = Number(options.limit || 10);
      const maxNew = Number(options.maxNew ?? 3);
      const grouped = new Map();
      nextVariants.forEach((variant) => {
        if (!variant?.conceptId) return;
        if (!grouped.has(variant.conceptId)) grouped.set(variant.conceptId, []);
        grouped.get(variant.conceptId).push(variant);
      });

      const candidates = [...grouped.entries()].map(([conceptId, conceptVariants]) => {
        const record = store.concepts[conceptId];
        const dueAt = Number(record?.dueAt || 0);
        const isNew = !record || !record.attempts;
        let rank = 4;
        if (record?.lastResult === 'again' || (dueAt && dueAt <= now)) rank = 0;
        else if (record && !record.ready) rank = 1;
        else if (dueAt && dueAt <= now + (2 * DAY_MS)) rank = 2;
        else if (isNew) rank = 3;
        const variant = variantForConcept(conceptVariants, conceptId, record);
        return { conceptId, record, variant, rank, dueAt, isNew };
      }).filter((item) => item.variant);

      candidates.sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        if (a.dueAt !== b.dueAt) return a.dueAt - b.dueAt;
        return Math.random() - 0.5;
      });

      const queue = [];
      let newCount = 0;
      candidates.forEach((item) => {
        if (queue.length >= limit) return;
        if (item.isNew && newCount >= maxNew) return;
        if (item.isNew) newCount += 1;
        queue.push(item.variant);
      });
      return queue;
    }

    function getReadinessSummary(nextVariants = variants, options = {}) {
      const now = options.now ? new Date(options.now).getTime() : Date.now();
      const conceptIds = [...new Set(nextVariants.map((variant) => variant.conceptId).filter(Boolean))];
      const records = conceptIds.map((conceptId) => ({ conceptId, record: store.concepts[conceptId] }));
      const ready = records.filter(({ record }) => record?.ready).length;
      const due = records.filter(({ record }) => record && Number(record.dueAt || 0) <= now).length;
      const learning = records.filter(({ record }) => record?.attempts && !record.ready).length;
      const fresh = conceptIds.length - ready - learning;
      const weak = records
        .filter(({ record }) => record?.attempts && !record.ready)
        .sort((a, b) => {
          const aMiss = a.record.lastResult === 'again' ? 0 : 1;
          const bMiss = b.record.lastResult === 'again' ? 0 : 1;
          return aMiss - bMiss || Number(a.record.stage || 0) - Number(b.record.stage || 0);
        })
        .slice(0, 8)
        .map(({ conceptId }) => conceptId);
      const upcoming = [1, 3, 7].map((days) => ({
        days,
        count: records.filter(({ record }) => {
          const dueAt = Number(record?.dueAt || 0);
          return dueAt > now && dueAt <= now + (days * DAY_MS);
        }).length
      }));
      return {
        total: conceptIds.length,
        ready,
        due,
        learning,
        new: fresh,
        readinessPercent: conceptIds.length ? Math.round((ready / conceptIds.length) * 100) : 0,
        coverageCount: Object.values(store.coverage).filter(Boolean).length,
        weakConceptIds: weak,
        upcoming,
        attempts: store.attempts.length
      };
    }

    function exportProgress() {
      return JSON.stringify(store, null, 2);
    }

    function importProgress(raw) {
      const parsed = typeof raw === 'string' ? parseJson(raw, null) : raw;
      validateImport(parsed);
      store = normalizeStore(parsed);
      save();
      return store;
    }

    function resetProgress() {
      storage.removeItem(STORAGE_KEY);
      store = emptyStore();
      save();
      return store;
    }

    function getStore() {
      return store;
    }

    function getConcept(conceptId) {
      return store.concepts[conceptId] || null;
    }

    return {
      loadAndMigrate,
      setVariants,
      setCoverage,
      setExamDate,
      recordAttempt,
      buildTodayQueue,
      getReadinessSummary,
      exportProgress,
      importProgress,
      resetProgress,
      getStore,
      getConcept
    };
  }

  const api = {
    VERSION,
    STORAGE_KEY,
    create,
    validateImport,
    normalizeResult,
    emptyStore
  };

  globalScope.LearningEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
