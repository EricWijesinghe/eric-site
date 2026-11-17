// The About stack. Every line and fact is taken from content.ts (one sentence of an existing paragraph,
// the role list, the stats, or the Maya2C status line and disclosure). The only new wording is the
// mechanism text on layers 02-04 (phases, break buttons, verdicts): general Rust, packet-inspection and
// signature facts that restate what content.ts already says, never a new claim about Eric or a number.
import { ABOUT_PARAGRAPHS, FEATURED_PROJECT, PROJECTS, ROLES, STATS } from './content';

export type LayerHue = 'cyan' | 'azure' | 'violet' | 'magenta' | 'ice';

export interface LayerFact {
  readonly label: string;
  readonly value: string;
}

export interface Layer {
  kicker: string;
  title: string;
  hue: LayerHue;
  /** One short line, the layer's whole explanation. */
  line: string;
  facts: readonly LayerFact[];
  /** Layer 01 only: the three roles, drawn as the origins the vias rise from. */
  roles?: readonly string[];
  /** Small print, kept verbatim from content.ts. */
  note?: string;
  /** The mechanism the plane runs, one label per phase ("term: text" sets the term in mono). */
  phases?: readonly string[];
  /** A button that tries to break the rule, and what the system answers. */
  breach?: { button: string; verdict: readonly string[] };
  link?: { label: string; href: string };
  /** Not reached yet: drawn as the unlit dashed plane. */
  pending?: boolean;
}

// Paragraphs are split at the full stop that ends a sentence, so each sentence can stand alone.
export const sentence = (paragraph: string, index: number): string =>
  paragraph.split(/(?<=\.)\s+/)[index] ?? '';

/** His own thesis, set in display type; the stack below is its picture. */
export const STATEMENT = sentence(ABOUT_PARAGRAPHS[0], 1);
/** The word that takes the active layer's hue. Rendered plain if the statement ever loses it. */
export const STATEMENT_KEY = 'complexity';

export const LAYERS: readonly Layer[] = [
  {
    kicker: '01',
    title: 'Self-directed learner',
    hue: 'cyan',
    line: sentence(ABOUT_PARAGRAPHS[0], 0),
    facts: [],
    roles: ROLES,
  },
  {
    kicker: '02',
    title: 'Rust',
    hue: 'azure',
    line: sentence(ABOUT_PARAGRAPHS[1], 1),
    facts: [STATS[0]],
    phases: [
      'owner: one binding owns the value',
      '&: any number of readers',
      '&mut: one writer, no readers',
      'drop: owner leaves scope, memory is freed',
    ],
    breach: {
      button: 'Request a second &mut',
      verdict: [
        'error[E0499]: cannot borrow `cell` as mutable more than once at a time',
        sentence(ABOUT_PARAGRAPHS[1], 2),
      ],
    },
  },
  {
    kicker: '03',
    title: 'Systems & security',
    hue: 'violet',
    line: sentence(ABOUT_PARAGRAPHS[2], 0),
    facts: [],
    phases: ['packet in', 'parse header', 'check', 'forward'],
    breach: { button: 'Send a malformed packet', verdict: ['Malformed header: dropped at the gate.'] },
  },
  {
    kicker: '04',
    title: 'Maya2C',
    hue: 'magenta',
    line: sentence(ABOUT_PARAGRAPHS[2], 1),
    facts: [STATS[1], STATS[2], STATS[3]],
    // content.ts: the disclosure is stated wherever Maya2C is presented.
    note: FEATURED_PROJECT.disclosure,
    phases: [
      'sign: ML-DSA + SLH-DSA',
      'verify: both must pass',
      'order: DAG-BFT',
      'final: deterministic finality',
    ],
    breach: {
      button: 'Drop one signature',
      verdict: ['One of two signatures missing: the transaction does not verify.'],
    },
    link: { label: 'See it run', href: '#projects' },
  },
  {
    kicker: '05',
    title: 'Mainnet',
    hue: 'ice',
    line: FEATURED_PROJECT.badge,
    facts: [],
    note: FEATURED_PROJECT.disclosure,
    pending: true,
  },
];

/** The layer selected on load: the project the stack exists for. */
export const DEFAULT_LAYER = 4;

// What the Rust core powers, shown on the constellation's core. Each entry restates a fact from
// content.ts: Maya2C is written in Rust, the systems layer is the stated focus, and the security
// research project is tagged Rust. No new claims.
export const CORE_POWERS: readonly string[] = [
  `${FEATURED_PROJECT.name}: Layer-1 blockchain`,
  'Systems layer: protocols & security',
  PROJECTS[1].badge,
];
