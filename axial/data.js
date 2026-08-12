const axialBoneGroups = {
  'Occipital Bone': ['Occipital condyles','Foramen magnum','Superior nuchal line','Inferior nuchal line','External occipital protuberance'],
  'Parietal Bones': ['Paired left and right parietal bones'],
  'Temporal Bones': ['Zygomatic process','Mandibular fossa','Mastoid process','Styloid process','Carotid canal','Foramen lacerum','External acoustic canal','Internal acoustic canal','Jugular foramen'],
  'Frontal Bone': ['Supraorbital foramen/notch','Supraorbital margin','Medial margin of orbital rim'],
  'Sphenoid Bone': ['Sella turcica','Optic canals','Foramen rotundum','Foramen ovale','Foramen spinosum'],
  'Ethmoid Bone': ['Cribriform plate','Crista galli','Perpendicular plate'],
  'Zygomatic Bones': ['Temporal process'],
  'Maxillary Bones': ['Alveolar processes','Infraorbital foramen'],
  'Palatine Bone': ['Palatine bone'],
  'Vomer': ['Vomer'],
  'Nasal Bones': ['Paired left and right nasal bones'],
  'Mandible': ['Alveolar processes','Mandibular symphysis','Mandibular ramus','Mandibular notch','Condylar process','Coronoid process','Mandibular foramen','Mental foramen'],
  'Sutures': ['Lambdoid suture','Sagittal suture','Coronal suture','Squamous suture'],
  'Sternum': ['Manubrium','Body','Xiphoid process'],
  'Vertebral Types': ['Cervical vertebra','Atlas (C1)','Axis (C2)','Thoracic vertebra','Lumbar vertebra','Sacral vertebra','Coccygeal vertebra'],
  'Vertebral Markings': ['Vertebral body','Vertebral foramen','Spinous process','Transverse process','Superior articular facets','Inferior articular facets','Transverse costal facets','Superior costal facets','Transverse foramen','Dens']
};

const axialOia = [
  ['Facial Expression','Orbicularis oris','Maxilla and mandible','Lips','Compresses and purses lips'],
  ['Facial Expression','Zygomaticus major','Zygomatic bone','Angle of mouth','Retracts and elevates corner of mouth'],
  ['Facial Expression','Zygomaticus minor','Zygomatic bone','Upper lip','Retracts and elevates upper lip'],
  ['Facial Expression','Buccinator','Alveolar process of maxilla and alveolar part of mandible','Blends into fibers of orbicularis oris','Compresses cheeks'],
  ['Facial Expression','Platysma','Superior thorax and acromion of scapula','Mandible and skin of cheek','Tenses skin of neck; depresses mandible; pulls lower lip down'],
  ['Facial Expression','Risorius','Fascia surrounding parotid salivary gland','Angle of mouth','Draws corner of mouth to the side'],
  ['Facial Expression','Corrugator supercilii','Orbital rim of frontal bone','Eyebrow','Pulls skin inferiorly and anteriorly; wrinkles brow'],
  ['Facial Expression','Orbicularis oculi','Medial margin of orbit','Skin around eyelids','Closes eye'],
  ['Mastication','Masseter','Zygomatic arch','Lateral surface of mandibular ramus','Elevates mandible and closes jaws'],
  ['Mastication','Temporalis','Along temporal lines of skull','Coronoid process of mandible','Elevates mandible'],
  ['Anterior Neck','Sternocleidomastoid','Sternal end of clavicle and manubrium of sternum','Mastoid region of skull and nuchal region of occipital bone','Together flex the neck; alone laterally flexes head and rotates face to opposite side'],
  ['Vertebral Column','Semispinalis capitis','Processes of inferior cervical and superior thoracic vertebrae','Nuchal region of occipital bone','Together extend head; alone extend and laterally flex neck'],
  ['Vertebral Column','Semispinalis cervicis','Transverse processes of T1-T5 or T6','Spinous processes of C2-C5','Extends vertebral column and rotates toward opposite side'],
  ['Vertebral Column','Semispinalis thoracis','Transverse processes of T6-T10','Spinous processes of C5-T4','Extends vertebral column and rotates toward opposite side'],
  ['Thorax','External intercostals','Inferior border of each rib','Superior border of more inferior rib','Elevate ribs'],
  ['Thorax','Internal intercostals','Superior border of each rib','Inferior border of preceding rib','Depress ribs'],
  ['Abdomen','Rectus abdominis','Superior surface of pubis around symphysis','Inferior surfaces of costal cartilages of ribs 5-7 and xiphoid process','Depresses ribs; flexes vertebral column; compresses abdomen']
];

const axialModelItems = axialOia.map((row) => row[1]);
const facialImage = 'assets/canvas-practical/facial-muscles.png';
const faceImageGroups = new Set(['Facial Expression', 'Mastication']);
const axialGroupByMuscle = Object.fromEntries(axialOia.map(([group, muscle]) => [muscle, group]));

function axialModelContext(item) {
  return faceImageGroups.has(axialGroupByMuscle[item]) ? 'face-image' : 'torso-fallback';
}

function axialModelNote(item) {
  return axialModelContext(item) === 'face-image'
    ? 'Identify from a facial-muscle image. No physical model is required.'
    : 'Use a torso reference because this structure is not present on the tested single-leg or arm models.';
}

window.STUDY_DATA = {
  meta: { title: 'BIO 2230 Axial Study Site', subtitle: 'Skull, thorax, vertebrae, muscles, OIAs, and practical drills' },
  bones: Object.entries(axialBoneGroups).flatMap(([region, terms]) => terms.map((term) => ({ id: `${region}|${term}`, region, term, references: [] }))),
  muscles: axialOia.map(([group, muscle, origin, insertion, action]) => ({ group, muscle, origin, insertion, action, practicalModel: true, image: faceImageGroups.has(group) ? facialImage : '' })),
  abbreviations: [],
  modelAssessmentProfile: {
    primaryContext: 'face-image',
    label: 'Face image and limited torso fallback',
    summary: 'Facial and mastication muscles use image identification only. Torso references are limited to axial muscles that do not appear on the tested single-leg or arm models.'
  },
  modelKey: axialModelItems.map((item, index) => ({
    number: String(index + 1),
    item,
    note: axialModelNote(item),
    assessmentContext: axialModelContext(item),
    assessmentContextLabel: axialModelContext(item) === 'face-image' ? 'Face image' : 'Torso fallback',
    images: [],
    image: faceImageGroups.has(axialGroupByMuscle[item]) ? facialImage : '',
    visualId: faceImageGroups.has(axialGroupByMuscle[item]) ? 'axial-facial-muscles' : ''
  })),
  practicalModelFocus: axialModelItems.map((item) => ({ item, note: axialModelNote(item), assessmentContext: axialModelContext(item) })),
  anchorPatterns: [
    { anchor: 'Zygomatic arch', muscles: 'Masseter', cue: 'Masseter begins at the arch and inserts on the lateral mandibular ramus.' },
    { anchor: 'Coronoid process of mandible', muscles: 'Temporalis', cue: 'Temporalis converges from the temporal lines to the coronoid process.' },
    { anchor: 'Mastoid region', muscles: 'Sternocleidomastoid', cue: 'Use the mastoid insertion to predict head rotation and lateral flexion.' },
    { anchor: 'Rib borders', muscles: 'External and internal intercostals', cue: 'Externals elevate ribs; internals depress ribs.' }
  ],
  reversePrompts: axialOia.map(([, muscle, origin, insertion, action]) => ({ prompt: `Origin: ${origin}. Insertion: ${insertion}. Action: ${action}.`, answer: muscle })),
  confusables: [
    { pair: 'Foramen ovale vs foramen spinosum vs foramen rotundum', why: 'All three openings are on the sphenoid.', separator: 'Use size and position: rotundum is round/anterior, ovale is larger and oval, spinosum is the small posterolateral opening.' },
    { pair: 'External vs internal acoustic canal', why: 'Both belong to the temporal bone.', separator: 'External opens laterally toward the ear; internal is seen inside the cranial cavity.' },
    { pair: 'Cervical vs thoracic vs lumbar vertebra', why: 'All share the basic vertebral plan.', separator: 'Cervical has transverse foramina; thoracic has costal facets; lumbar has the largest body.' },
    { pair: 'Zygomaticus major vs minor', why: 'Both arise from the zygomatic bone and elevate the mouth region.', separator: 'Major inserts at the corner of the mouth; minor inserts into the upper lip.' },
    { pair: 'External vs internal intercostals', why: 'They occupy the same intercostal spaces.', separator: 'External elevates ribs; internal depresses ribs.' }
  ],
  actionLookup: [
    { action: 'Close the eye', muscles: 'Orbicularis oculi', narrow: 'Circular muscle surrounding the orbit.' },
    { action: 'Purse the lips', muscles: 'Orbicularis oris', narrow: 'Circular muscle surrounding the mouth.' },
    { action: 'Elevate the mandible', muscles: 'Masseter; temporalis', narrow: 'Masseter inserts on ramus; temporalis inserts on coronoid process.' },
    { action: 'Flex the neck', muscles: 'Sternocleidomastoid', narrow: 'Bilateral action flexes; unilateral action rotates the face opposite.' },
    { action: 'Extend the vertebral column', muscles: 'Semispinalis cervicis; semispinalis thoracis', narrow: 'Both also rotate toward the opposite side.' },
    { action: 'Elevate or depress ribs', muscles: 'External intercostals elevate; internal intercostals depress', narrow: 'Match the muscle layer to respiratory movement.' }
  ],
  cramSheet: [
    { cue: 'Cranial foramina', memory: 'Sphenoid: rotundum, ovale, spinosum, optic canals; temporal region: carotid canal, jugular foramen, acoustic canals', why: 'Group openings by bone before memorizing individual positions.' },
    { cue: 'Vertebral types', memory: 'Cervical = transverse foramina; thoracic = costal facets; lumbar = large body', why: 'These are the fastest practical separators.' },
    { cue: 'C1 and C2', memory: 'Atlas supports the skull; axis carries the dens', why: 'The dens is the decisive C2 landmark.' },
    { cue: 'Facial muscle rings', memory: 'Orbicularis oculi closes eye; orbicularis oris purses lips', why: 'Function follows their circular arrangement.' },
    { cue: 'Intercostals', memory: 'External elevates; internal depresses', why: 'A common paired-action question.' }
  ],
  anchorMaps: [
    { landmark: 'Zygomatic arch', muscles: 'Masseter', role: 'Origin', separator: 'Masseter inserts on lateral mandibular ramus.' },
    { landmark: 'Coronoid process', muscles: 'Temporalis', role: 'Insertion', separator: 'Do not confuse with the mandibular condylar process.' },
    { landmark: 'Mastoid region', muscles: 'Sternocleidomastoid', role: 'Insertion', separator: 'Trace the muscle to sternum and clavicle.' },
    { landmark: 'Xiphoid process', muscles: 'Rectus abdominis', role: 'Insertion', separator: 'Also inserts on costal cartilages of ribs 5-7.' }
  ],
  outLoudPrompts: [
    { type: 'Skull marking', sequence: 'Name the marking, name its bone, then identify an articulating bone or nearby landmark.', standard: 'You can place the marking on an unlabeled skull.' },
    { type: 'Vertebra', sequence: 'Name the vertebral type and state the landmark that proves it.', standard: 'You can distinguish cervical, thoracic, lumbar, atlas, and axis.' },
    { type: 'Muscle OIA', sequence: 'Name the muscle, origin, insertion, and action.', standard: 'You can retrieve all three without reading the table.' }
  ],
  palVisuals: [{ id: 'axial-facial-muscles', category: 'Axial muscles', sourceKey: 'canvas-practical', number: '01', code: 'Facial muscles', title: 'Facial and anterior neck muscles - Canvas practical image', labeledImage: facialImage, reviewImage: facialImage }],
  leftRightImages: [], structureImages: [], boneLeaderCards: [], boneImageCards: [], practicalLabelingCards: [], muscleImageCards: [],
  courseMuscleImages: Object.fromEntries(axialOia
    .filter(([group]) => faceImageGroups.has(group))
    .map(([, muscle]) => [muscle, {
      image: facialImage,
      sourceTitle: 'Facial and anterior neck muscles - Canvas practical image',
      sourceKind: 'course-practical-image',
      sourceTypeLabel: 'Course practical image',
      sourceDescription: 'Course image with multiple lettered structures. It is a reference image, not a Belmont lab-model photo or a single-answer highlighted prompt.',
      questionReady: false
    }])),
  muscleImageLookup: { 'Orbicularis oris': facialImage, 'Orbicularis oculi': facialImage, 'Zygomaticus major': facialImage, 'Zygomaticus minor': facialImage, 'Buccinator': facialImage, 'Platysma': facialImage, 'Risorius': facialImage, 'Corrugator supercilii': facialImage, 'Masseter': facialImage, 'Temporalis': facialImage, 'Sternocleidomastoid': facialImage },
  muscleVisualLookup: {}
};
