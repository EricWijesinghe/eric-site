// Presentation only: which scene each Projects act mounts, how it is described to screen readers, the
// one-line explainer under it, and the label of its keyboard control. Facts (names, badges, descriptions,
// disclosure, links) stay in content.ts. Illustrations say so.

// Every scene has the same keyboard path (scene-core): Tab to the control under the scene, arrows move a
// probe that inspects what it passes over, Shift with an arrow drags one step, Enter runs the control.
const KEYS =
  ' Keyboard: Tab to the control under the scene, arrow keys move a probe over it, Shift with an arrow turns it one step, Enter runs the control.';
// The stages also hold one tab stop of inspect points (scene-spots): arrows move between them, Enter presses one,
// and the line under the stage says what is under the pointer or the focus.
const SPOTS = ' Inside the stage, Tab to its inspect points and use the arrow keys to move between them.';

/** The two stages, in page order: Maya2C, then UNICRON. `key` picks the facts from content.ts. */
export const ACTS = [
  {
    key: 'maya',
    scene: 'maya',
    tag: 'live',
    aria:
      'Maya2C, drawn as one transaction\'s life: it is signed with ML-DSA and SLH-DSA, both must verify, ' +
      'then it joins a DAG round, gets a quorum certificate, is anchored by a leader and becomes final. ' +
      'The lattice shows a rejected signing attempt before an accepted one, the hash tree hashes a leaf up to its root, ' +
      'and one seal locks when both proofs verify. Hover a block or a tree node, or drag to turn the lattice.' +
      SPOTS +
      KEYS,
    hint: 'Hover, tap or focus a block, the lattice, a tree node or the seal to read what it does.',
    act: 'Replay the dual-verify lock',
    caption: 'A transaction is signed twice and both signatures must verify; a DAG round, a quorum certificate and a leader anchor then make it final.',
    formula: 'accept(tx) = verify_ML-DSA(tx, σ₁) ∧ verify_SLH-DSA(tx, σ₂)',
  },
  {
    key: 'unicron',
    scene: 'unicron',
    tag: 'illustration',
    aria:
      'Illustration: an assessment pipeline, recon, enumeration, scan, validation and report, runs over a graph of hosts, ' +
      "with severity marks on each host and the pipeline stage named above it; the attack path's hops are named by " +
      'MITRE ATT&CK tactics set round the radar. Hover a host or a tactic to inspect it.' +
      SPOTS +
      KEYS,
    hint: 'Tap or focus a host or a tactic to read what it stands for.',
    act: 'Run a scan sweep',
    caption: 'An assessment pipeline: recon, enumeration, scan, validation and report.',
    formula: '',
  },
] as const;

/** The bench: the two focus areas side by side in one frame. */
export const BENCH = {
  research: {
    scene: 'fuzz',
    aria:
      'Illustration: a coverage-guided fuzzing loop picks inputs, mutates them, runs the target and keeps inputs that reach new code, ' +
      'while a coverage map fills in. Beneath it, a use-after-free that C compiles and runs is rejected at compile time by Rust\'s borrow rules.' +
      KEYS,
    act: 'Run another fuzzing round',
  },
  ai: {
    scene: 'neural',
    aria:
      'Illustration: a prompt passes an input guard, a small model and an output filter. A prompt-injection attempt is flagged at the guard. ' +
      'An embedding space shows benign and malicious inputs as two clusters split by a boundary; a point you place is classified by which side it lands on.' +
      KEYS,
    act: 'Send an activation through the model',
  },
} as const;

// Shown on the Maya2C stage while no live chain data reaches the page: the drawing is then structure only.
export const STRUCTURE_ONLY = 'structure only · no live data';
