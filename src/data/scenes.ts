// Presentation only: which scene each Projects chapter mounts, how it is described to screen
// readers, the one-line caption under it, and the label of its keyboard control. Facts (names,
// badges, descriptions, disclosure, links) stay in content.ts. Every mechanism shown here is
// explained in the caption, and the illustrations say so.

// Every scene has the same keyboard path (scene-core): Tab to the control under the scene, arrows move a
// probe that inspects what it passes over, Shift with an arrow drags one step, Enter runs the control.
const KEYS =
  ' Keyboard: Tab to the control under the scene, arrow keys move a probe over it, Shift with an arrow turns it one step, Enter runs the control.';

export const CHAPTERS = {
  maya: {
    scene: 'maya',
    aria:
      'Maya2C, drawn as one transaction\'s life: it is signed with ML-DSA and SLH-DSA, both must verify, ' +
      'then it joins a DAG round, gets a certificate from 2f+1 validators, is anchored by a leader and becomes final. ' +
      'The lattice shows a rejected signing attempt before an accepted one, the hash tree hashes a leaf up to its root, ' +
      'and one seal locks when both proofs verify. Hover a block or a tree node, or drag to turn the lattice.' +
      KEYS,
    act: 'Replay the dual-verify lock',
    caption:
      'A transaction is signed twice, both signatures must verify, then a DAG round, a 2f+1 certificate and a leader anchor make it final.',
  },
  unicron: {
    scene: 'unicron',
    aria:
      'Illustration: an assessment pipeline, recon, enumeration, scan, validation and report, runs over an attack-surface ' +
      'graph of hosts. A mapped attack path carries MITRE ATT&CK tactic names, severity marks show each host, and an illustrative ' +
      'scan terminal scrolls beside the radar. Hover a host to see its illustrative ports.' +
      KEYS,
    act: 'Run a scan sweep',
    caption:
      'Illustration of an assessment pipeline: recon, enumeration, scan, validation, report, with its attack path named by MITRE ATT&CK tactic.',
  },
  research: {
    scene: 'fuzz',
    aria:
      'Illustration: a coverage-guided fuzzing loop picks inputs, mutates them, runs the target and keeps inputs that reach new code, ' +
      'while a coverage map fills in. Beneath it, a use-after-free that C compiles and runs is rejected at compile time by Rust\'s borrow rules.' +
      KEYS,
    act: 'Run another fuzzing round',
    caption:
      'Illustration: a coverage-guided fuzzer grows its coverage map, and Rust\'s borrow rules reject the use-after-free that C would compile.',
  },
  ai: {
    scene: 'neural',
    aria:
      'Illustration: a prompt passes an input guard, a small model and an output filter. A prompt-injection attempt is flagged at the guard. ' +
      'An embedding space shows benign and malicious inputs as two clusters split by a boundary; a point you place is classified by which side it lands on.' +
      KEYS,
    act: 'Send an activation through the model',
    caption:
      'Illustration: a prompt passes an input guard, a model and an output filter, and an embedding boundary separates benign from malicious inputs.',
  },
} as const;

// Shown on the Maya2C scene while no live chain data reaches the page: the drawing is then structure only.
export const STRUCTURE_ONLY = 'structure only · no live data';
