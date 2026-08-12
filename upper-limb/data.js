const boneGroups = {
  'Scapula': ['Superior border','Medial border','Lateral border','Superior angle','Inferior angle','Acromion','Coracoid process','Supraspinous fossa','Infraspinous fossa','Suprascapular notch','Subscapular fossa','Supraglenoid tubercle','Infraglenoid tubercle','Scapular spine','Glenoid cavity'],
  'Clavicle': ['Acromial (lateral) end','Sternal (medial) end','Conoid tubercle','Costal tuberosity','Superior border','Inferior border'],
  'Humerus': ['Head of humerus','Greater tubercle','Lesser tubercle','Intertubercular sulcus','Anatomical neck','Surgical neck','Deltoid tuberosity','Coronoid fossa','Olecranon fossa','Medial epicondyle','Lateral epicondyle','Capitulum','Trochlea'],
  'Radius': ['Head','Neck','Radial tuberosity','Ulnar notch (of radius)','Styloid process'],
  'Ulna': ['Radial notch (of ulna)','Ulnar tuberosity','Olecranon process','Trochlear notch','Coronoid process','Styloid process'],
  'Hand': ['Pisiform','Triquetrum','Lunate','Scaphoid','Hamate','Capitate','Trapezoid','Trapezium','Metacarpals','Phalanges','Pollex']
};

const oia = [
  ['Pectoral Girdle','Trapezius','Nuchal region of occipital bone and thoracic vertebrae','Clavicle, scapular spine, and acromion of scapula','Elevates, retracts, depresses, or upwardly rotates scapula; elevates clavicle; extends neck'],
  ['Pectoral Girdle','Levator scapulae','Vertebrae C1-C4','Medial border of scapula','Elevates scapula'],
  ['Pectoral Girdle','Rhomboid minor','Vertebrae C7-T1','Medial border of scapula','Adducts scapula'],
  ['Pectoral Girdle','Rhomboid major','Superior thoracic vertebrae','Medial border of scapula','Adducts scapula'],
  ['Pectoral Girdle','Subclavius','First rib','Inferior border of clavicle','Depresses shoulder'],
  ['Pectoral Girdle','Pectoralis minor','Ribs 3-5','Coracoid process of scapula','Depresses shoulder; downwardly rotates scapula; elevates ribs if scapula is stationary'],
  ['Pectoral Girdle','Serratus anterior','Ribs 1-9','Medial border of scapula','Upwardly rotates scapula'],
  ['Shoulder','Supraspinatus','Supraspinous fossa of scapula','Greater tubercle of humerus','Abducts arm at shoulder'],
  ['Shoulder','Teres minor','Lateral border of scapula','Greater tubercle of humerus','Laterally rotates arm at shoulder'],
  ['Shoulder','Infraspinatus','Infraspinous fossa of scapula','Greater tubercle of humerus','Laterally rotates arm at shoulder'],
  ['Shoulder','Subscapularis','Subscapular fossa of scapula','Lesser tubercle of humerus','Medially rotates arm at shoulder'],
  ['Shoulder','Deltoid','Clavicle, scapular spine, and acromion of scapula','Deltoid tuberosity of humerus','Abducts arm at shoulder'],
  ['Shoulder','Pectoralis major','Ribs 2-6, sternum, and clavicle','Greater tubercle and intertubercular sulcus of humerus','Flexes, adducts, and medially rotates arm at shoulder'],
  ['Shoulder','Triceps brachii','Lateral head: superior humerus; long head: infraglenoid tubercle; medial head: posterior humerus','Olecranon process of ulna','Extends forearm at elbow'],
  ['Shoulder','Teres major','Inferior angle of scapula','Intertubercular sulcus of humerus','Extends, adducts, and medially rotates arm at shoulder'],
  ['Shoulder','Latissimus dorsi','Vertebrae T7-L5 and ribs 8-12','Intertubercular sulcus of humerus','Extends, adducts, and medially rotates arm at shoulder'],
  ['Forearm','Biceps brachii','Short head: coracoid process; long head: supraglenoid tubercle','Radial tuberosity','Flexes and supinates forearm at elbow; flexes arm at shoulder'],
  ['Forearm','Brachialis','Anterior distal humerus','Ulnar tuberosity','Flexes forearm at elbow'],
  ['Forearm','Brachioradialis','Lateral epicondyle of humerus','Styloid process of radius','Flexes forearm at elbow'],
  ['Forearm','Pronator teres','Medial epicondyle of humerus and coronoid process of ulna','Midlateral surface of radius','Pronates forearm'],
  ['Forearm','Pronator quadratus','Anterior and medial distal ulna','Anterolateral distal radius','Pronates forearm']
];

const modelItems = ['Trapezius','Extensor carpi radialis longus','Subclavius','Extensor carpi radialis brevis','Pectoralis minor','Supraspinatus','Deltoid','Pectoralis major','Teres minor','Extensor digitorum','Infraspinatus','Biceps brachii - long head','Biceps brachii - short head','Brachioradialis','Flexor digitorum superficialis','Extensor carpi ulnaris','Flexor carpi ulnaris','Flexor carpi radialis','Pronator teres','Palmaris longus','Brachialis','Triceps brachii - medial head','Triceps brachii - long head','Latissimus dorsi','Teres major','Triceps brachii - lateral head','Subscapularis','Flexor digitorum profundus','Pronator quadratus'];
const torsoFallbackItems = new Set(['Trapezius', 'Subclavius', 'Pectoralis minor', 'Pectoralis major', 'Latissimus dorsi']);

function upperModelContext(item) {
  return torsoFallbackItems.has(item) ? 'torso-fallback' : 'arm-model';
}

function upperModelNote(item) {
  return torsoFallbackItems.has(item)
    ? 'Use a torso reference because this muscle is not present on the tested arm model.'
    : 'Identify on the tested arm model.';
}

window.STUDY_DATA = {
  meta: { title: 'BIO 2230 Upper Limb Study Site', subtitle: 'Bones, markings, muscles, OIAs, and practical drills' },
  bones: Object.entries(boneGroups).flatMap(([region, terms]) => terms.map((term) => ({ id: `${region}|${term}`, region, term, references: [] }))),
  muscles: oia.map(([group, muscle, origin, insertion, action]) => ({ group, muscle, origin, insertion, action, practicalModel: modelItems.includes(muscle) })),
  abbreviations: [],
  modelAssessmentProfile: {
    primaryContext: 'arm-model',
    label: 'Arm model',
    summary: 'Students identify upper-limb muscles on the tested arm model. Torso references are used only for listed muscles that are not present on that arm model.'
  },
  modelKey: modelItems.map((item, index) => ({
    number: String(index + 1),
    item,
    note: upperModelNote(item),
    assessmentContext: upperModelContext(item),
    assessmentContextLabel: torsoFallbackItems.has(item) ? 'Torso fallback' : 'Arm model',
    images: [],
    image: '',
    visualId: ''
  })),
  practicalModelFocus: modelItems.map((item) => ({ item, note: upperModelNote(item), assessmentContext: upperModelContext(item) })),
  anchorPatterns: [
    { anchor: 'Greater tubercle', muscles: 'Supraspinatus; infraspinatus; teres minor', cue: 'Three rotator-cuff muscles insert here; subscapularis goes to the lesser tubercle.' },
    { anchor: 'Intertubercular sulcus', muscles: 'Pectoralis major; teres major; latissimus dorsi', cue: 'All three adduct and medially rotate the arm.' },
    { anchor: 'Medial border of scapula', muscles: 'Levator scapulae; rhomboid minor; rhomboid major; serratus anterior', cue: 'Know whether the action is elevation, adduction, or upward rotation.' }
  ],
  reversePrompts: oia.map(([, muscle, origin, insertion, action]) => ({ prompt: `Origin: ${origin}. Insertion: ${insertion}. Action: ${action}.`, answer: muscle })),
  confusables: [
    { pair: 'Teres minor vs teres major', why: 'Both arise from the scapula and are near each other posteriorly.', separator: 'Teres minor inserts on greater tubercle and laterally rotates; teres major inserts in intertubercular sulcus and medially rotates.' },
    { pair: 'Supraspinatus vs infraspinatus', why: 'Both are rotator-cuff muscles on the posterior scapula.', separator: 'Supraspinatus starts in the supraspinous fossa and abducts; infraspinatus starts in the infraspinous fossa and laterally rotates.' },
    { pair: 'Radius vs ulna', why: 'Both are forearm bones.', separator: 'Radius is lateral in anatomical position and has a radial tuberosity; ulna is medial and has the olecranon and trochlear notch.' },
    { pair: 'Biceps brachii vs brachialis', why: 'Both flex the forearm at the elbow.', separator: 'Biceps inserts on radial tuberosity and supinates; brachialis inserts on ulnar tuberosity.' }
  ],
  actionLookup: [
    { action: 'Shoulder abduction', muscles: 'Supraspinatus; deltoid', narrow: 'Supraspinatus begins the movement; deltoid is the broad lateral shoulder muscle.' },
    { action: 'Shoulder lateral rotation', muscles: 'Infraspinatus; teres minor', narrow: 'Both insert on the greater tubercle.' },
    { action: 'Shoulder medial rotation / adduction', muscles: 'Pectoralis major; teres major; latissimus dorsi; subscapularis', narrow: 'Subscapularis is the rotator-cuff member and inserts on lesser tubercle.' },
    { action: 'Forearm flexion', muscles: 'Biceps brachii; brachialis; brachioradialis', narrow: 'Biceps also supinates; brachialis attaches to ulna; brachioradialis reaches radius styloid.' },
    { action: 'Forearm pronation', muscles: 'Pronator teres; pronator quadratus', narrow: 'Teres originates near medial epicondyle; quadratus is distal forearm.' }
  ],
  cramSheet: [
    { cue: 'Rotator cuff', memory: 'SITS: supraspinatus, infraspinatus, teres minor, subscapularis', why: 'Three insert on greater tubercle; subscapularis inserts on lesser tubercle.' },
    { cue: 'Shoulder sulcus trio', memory: 'Pectoralis major; teres major; latissimus dorsi', why: 'All insert at the intertubercular sulcus and medially rotate/adduct.' },
    { cue: 'Forearm side check', memory: 'Radius = lateral / thumb side; ulna = medial / pinky side', why: 'Use olecranon and trochlear notch to recognize ulna.' },
    { cue: 'Scapula surface check', memory: 'Spine and infraspinous fossa = posterior; subscapular fossa = anterior', why: 'A frequent practical-style orientation check.' }
  ],
  anchorMaps: [
    { landmark: 'Greater tubercle', muscles: 'Supraspinatus; infraspinatus; teres minor', role: 'Insertion', separator: 'Rotator cuff except subscapularis.' },
    { landmark: 'Lesser tubercle', muscles: 'Subscapularis', role: 'Insertion', separator: 'The anterior rotator-cuff muscle.' },
    { landmark: 'Intertubercular sulcus', muscles: 'Pectoralis major; teres major; latissimus dorsi', role: 'Insertion', separator: 'Arm adduction and medial rotation group.' },
    { landmark: 'Radial tuberosity', muscles: 'Biceps brachii', role: 'Insertion', separator: 'Explains biceps forearm supination.' }
  ],
  outLoudPrompts: [
    { type: 'Bone or marking', sequence: 'Name the structure, name its bone, then orient it or name a nearby landmark.', standard: 'You can recognize it on an unlabeled model.' },
    { type: 'Muscle OIA', sequence: 'Name muscle, origin, insertion, and action without looking.', standard: 'Use the attachment to explain the action.' },
    { type: 'Model muscle', sequence: 'Name the stickered muscle and distinguish it from its nearest neighbor.', standard: 'You can identify it from a model view.' }
  ],
  palVisuals: [], leftRightImages: [], structureImages: [], boneLeaderCards: [], boneImageCards: [], practicalLabelingCards: [], muscleImageCards: [], muscleImageLookup: {}, muscleVisualLookup: {}
};
