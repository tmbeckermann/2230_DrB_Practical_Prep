(() => {
  const data = window.STUDY_DATA;
  if (!data) throw new Error('Load the section data before model-image-banks.js.');

  const sourceTypes = {
    'lab-model-photo': {
      label: 'Lab model photo',
      description: 'Photograph of a physical lab model.'
    },
    'course-practical-image': {
      label: 'Course practical image',
      description: 'Image used in course practical materials. It is not automatically a lab-model photograph.'
    },
    'course-model-reference': {
      label: 'Course model reference',
      description: 'Existing course material showing a physical teaching model. It is reference-only, not a fabricated or newly claimed lab-model photograph.'
    },
    'pal-atlas-substitute': {
      label: 'PAL atlas substitute',
      description: 'Highlighted PAL atlas art used as a substitute for model-ID practice. This is not a Belmont lab-model photo.'
    },
    'repository-reference-image': {
      label: 'Repository reference image',
      description: 'Existing reference image with no claim that it is a lab-model photograph.'
    }
  };

  const assessmentContexts = {
    'single-leg-model': {
      label: 'Single-leg model',
      description: 'Supports identification on the tested single-leg teaching model.'
    },
    'arm-model': {
      label: 'Arm model',
      description: 'Supports identification on the tested arm model.'
    },
    'face-image': {
      label: 'Face image',
      description: 'Image-identification practice only. No physical face model is required.'
    },
    'torso-fallback': {
      label: 'Torso fallback',
      description: 'Used only because this item is not present on the tested single-leg or arm models.'
    }
  };

  const nameAliases = {
    'long head of biceps femoris': 'Biceps femoris',
    'short head of biceps femoris': 'Biceps femoris'
  };
  const referenceOnlyHeadTerms = new Set([
    'biceps brachii - long head',
    'biceps brachii - short head',
    'long head of biceps femoris',
    'short head of biceps femoris'
  ]);
  const coursePracticalPaths = new Set(
    Object.values(data.courseMuscleImages || {}).flatMap((value) => Array.isArray(value) ? value : [value])
      .map((value) => typeof value === 'string' ? value : value?.image)
      .filter(Boolean)
  );

  function normalizeName(value) {
    return String(value || '').trim().toLowerCase();
  }

  function inferSourceKind(image) {
    const path = String(image || '').toLowerCase();
    if (coursePracticalPaths.has(image)) return 'course-practical-image';
    if (path.includes('/assets/questions/') || path.startsWith('assets/questions/')) return 'pal-atlas-substitute';
    if (path.includes('/assets/pal/') || path.startsWith('assets/pal/')) return 'pal-atlas-substitute';
    if (path.includes('/assets/canvas-practical/') || path.startsWith('assets/canvas-practical/')) return 'course-practical-image';
    return 'repository-reference-image';
  }

  function sourceEntry(value, defaults = {}) {
    const raw = typeof value === 'string' ? { image: value } : (value || {});
    if (!raw.image) return null;
    const sourceKind = raw.sourceKind || defaults.sourceKind || inferSourceKind(raw.image);
    const source = sourceTypes[sourceKind] || sourceTypes['repository-reference-image'];
    const assessmentContext = raw.assessmentContext || defaults.assessmentContext || '';
    const context = assessmentContexts[assessmentContext] || {};
    const questionReadyDefault = sourceKind === 'lab-model-photo' || sourceKind === 'pal-atlas-substitute';
    return {
      ...raw,
      sourceKind,
      sourceTypeLabel: raw.sourceTypeLabel || defaults.sourceTypeLabel || source.label,
      sourceDescription: raw.sourceDescription || defaults.sourceDescription || source.description,
      assessmentContext,
      assessmentContextLabel: raw.assessmentContextLabel || defaults.assessmentContextLabel || context.label || '',
      assessmentContextDescription: raw.assessmentContextDescription || defaults.assessmentContextDescription || context.description || '',
      questionReady: raw.questionReady ?? defaults.questionReady ?? questionReadyDefault
    };
  }

  function imageValues(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  function findMuscleCard(name) {
    const requested = normalizeName(name);
    const alias = normalizeName(nameAliases[requested]);
    return (data.muscleImageCards || []).find((card) => {
      const cardNames = [card.label, card.answer].map(normalizeName);
      return cardNames.includes(requested) || (alias && cardNames.includes(alias));
    });
  }

  function contextualPalValues(values, row) {
    const context = row.assessmentContext;
    const viewText = (value) => {
      if (typeof value === 'string') return value.toLowerCase();
      return `${value?.image || ''} ${value?.sourceTitle || ''}`.toLowerCase();
    };
    if (context === 'arm-model') {
      const armViews = values.filter((value) => /upper-limb-|scapula and arm|forearm/.test(viewText(value)));
      return armViews.length ? armViews : values;
    }
    if (context === 'torso-fallback') {
      const torsoViews = values.filter((value) => /trunk-|muscles of the trunk/.test(viewText(value)));
      return torsoViews.length ? torsoViews : values;
    }
    if (context === 'face-image') {
      const faceViews = values.filter((value) => /head-neck-|head and neck|muscles of the head/.test(viewText(value)));
      return faceViews.length ? faceViews : values;
    }
    return values;
  }

  function rowContextDefaults(row) {
    return {
      assessmentContext: row.assessmentContext || data.modelAssessmentProfile?.primaryContext || '',
      assessmentContextLabel: row.assessmentContextLabel || ''
    };
  }

  function palCardImages(name, row) {
    const card = findMuscleCard(name);
    if (!card) return [];
    const values = contextualPalValues(imageValues(card.reviewImages?.length ? card.reviewImages : card.reviewImage), row);
    return values.map((value) => sourceEntry(value, {
      sourceKind: 'pal-atlas-substitute',
      questionReady: true,
      ...rowContextDefaults(row)
    })).filter(Boolean);
  }

  function existingRowImages(row) {
    const values = imageValues(row.images?.length ? row.images : row.image);
    return values.map((value) => sourceEntry(value, {
      sourceKind: row.imageSourceKind,
      sourceTypeLabel: row.imageSourceLabel,
      sourceDescription: row.imageSourceDescription,
      questionReady: row.imageQuestionReady,
      ...rowContextDefaults(row)
    })).filter(Boolean);
  }

  function courseImages(name, row) {
    return imageValues(data.courseMuscleImages?.[name]).map((value) => sourceEntry(value, {
      sourceKind: 'course-practical-image',
      questionReady: false,
      ...rowContextDefaults(row)
    })).filter(Boolean);
  }

  function courseModelReferenceImages(name, row) {
    if (row.assessmentContext !== 'single-leg-model') return [];
    const requested = normalizeName(nameAliases[normalizeName(name)] || name);
    return (data.practicalLabelingCards || [])
      .filter((card) => normalizeName(card.sourceTitle).includes('lower limb muscles'))
      .filter((card) => (card.terms || []).some((term) => {
        const normalizedTerm = normalizeName(nameAliases[normalizeName(term)] || term);
        return normalizedTerm === requested;
      }))
      .slice(0, 2)
      .map((card) => sourceEntry({
        image: card.reviewImage,
        labeledImage: card.labeledImage,
        sourceTitle: card.label
      }, {
        sourceKind: 'course-model-reference',
        sourceTypeLabel: 'Course single-leg model view',
        sourceDescription: 'Existing course material showing the single-leg teaching model. This multi-label view is reference-only and is not a fabricated or newly claimed lab-model photograph.',
        questionReady: false,
        ...rowContextDefaults(row)
      }))
      .filter(Boolean);
  }

  function fallbackLookupImage(name, row) {
    const image = data.muscleImageLookup?.[name];
    return image ? [sourceEntry(image, rowContextDefaults(row))] : [];
  }

  function uniqueImages(items) {
    const seen = new Set();
    return items.filter((item) => {
      if (!item?.image || seen.has(item.image)) return false;
      seen.add(item.image);
      return true;
    });
  }

  function sourcePriority(item) {
    const priorities = {
      'lab-model-photo': 0,
      'pal-atlas-substitute': 1,
      'course-practical-image': 2,
      'course-model-reference': 3,
      'repository-reference-image': 4
    };
    return priorities[item.sourceKind] ?? 4;
  }

  function contextDisplayPriority(item, row) {
    if (row.assessmentContext === 'single-leg-model' && item.sourceKind === 'course-model-reference') return 0;
    if (row.assessmentContext === 'face-image' && item.sourceKind === 'course-practical-image') return 0;
    return item.questionReady !== false ? 1 : 2;
  }

  data.modelImageSourceLegend = sourceTypes;
  data.modelAssessmentContextLegend = assessmentContexts;
  data.modelKey = (data.modelKey || []).map((row) => {
    const bank = uniqueImages([
      ...existingRowImages(row),
      ...palCardImages(row.item, row),
      ...courseImages(row.item, row),
      ...courseModelReferenceImages(row.item, row),
      ...fallbackLookupImage(row.item, row)
    ]).map((item) => referenceOnlyHeadTerms.has(normalizeName(row.item))
      ? {
          ...item,
          questionReady: false,
          sourceDescription: `${item.sourceDescription} This view is reference-only because it does not isolate the named muscle head.`
        }
      : item).sort((a, b) => {
      const displayDifference = contextDisplayPriority(a, row) - contextDisplayPriority(b, row);
      if (displayDifference) return displayDifference;
      return sourcePriority(a) - sourcePriority(b);
    });
    const primary = bank[0] || null;
    return {
      ...row,
      images: bank,
      image: primary?.image || '',
      imageSourceKind: primary?.sourceKind || '',
      imageSourceLabel: primary?.sourceTypeLabel || '',
      imageSourceDescription: primary?.sourceDescription || '',
      assessmentContext: row.assessmentContext || data.modelAssessmentProfile?.primaryContext || '',
      assessmentContextLabel: row.assessmentContextLabel || primary?.assessmentContextLabel || ''
    };
  });

  const allImages = data.modelKey.flatMap((row) => row.images || []);
  const questionImages = allImages.filter((item) => item.questionReady !== false);
  const countBySource = (items) => Object.fromEntries(Object.keys(sourceTypes).map((kind) => [
    kind,
    items.filter((item) => item.sourceKind === kind).length
  ]));
  data.modelImageBankStats = {
    structures: data.modelKey.length,
    structuresWithQuestionImages: data.modelKey.filter((row) => (row.images || []).some((item) => item.questionReady !== false)).length,
    structuresWithAnyImages: data.modelKey.filter((row) => (row.images || []).length).length,
    totalImages: allImages.length,
    questionImages: questionImages.length,
    sourceCounts: countBySource(allImages),
    questionSourceCounts: countBySource(questionImages),
    contextCounts: Object.fromEntries(Object.keys(assessmentContexts).map((context) => [
      context,
      data.modelKey.filter((row) => row.assessmentContext === context).length
    ]))
  };
})();
