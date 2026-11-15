// The About timeline. Every line is taken from content.ts (one sentence of an existing paragraph,
// the role list, or the Maya2C status line and disclosure), so the timeline adds presentation,
// never a new claim or number.
import { ABOUT_PARAGRAPHS, FEATURED_PROJECT, PROJECTS, ROLES, STATS } from './content';

type Stat = (typeof STATS)[number];

export interface JourneyNode {
  kicker: string;
  title: string;
  /** One short line, shown when the node is opened. */
  line: string;
  /** Small print under the line, kept verbatim from content.ts. */
  note?: string;
  /** HUD readouts drawn under the node. */
  stats: readonly Stat[];
  /** Not reached yet: drawn as a hollow, dashed marker. */
  pending?: boolean;
}

// Paragraphs are split at the full stop that ends a sentence, so each sentence can stand alone.
const sentence = (paragraph: string, index: number): string =>
  paragraph.split(/(?<=\.)\s+/)[index] ?? '';

/** The first ABOUT paragraph, set in display type as the statement. */
export const STATEMENT = ABOUT_PARAGRAPHS[0];

export const JOURNEY: readonly JourneyNode[] = [
  { kicker: '01', title: 'Self-directed learner', line: ROLES.join(' · '), stats: [] },
  { kicker: '02', title: 'Rust', line: sentence(ABOUT_PARAGRAPHS[1], 1), stats: [STATS[0]] },
  { kicker: '03', title: 'Systems & security', line: sentence(ABOUT_PARAGRAPHS[2], 0), stats: [STATS[1]] },
  { kicker: '04', title: 'Maya2C', line: sentence(ABOUT_PARAGRAPHS[2], 1), stats: [STATS[2], STATS[3]] },
  {
    kicker: '05',
    title: 'Mainnet',
    line: FEATURED_PROJECT.badge,
    note: FEATURED_PROJECT.disclosure,
    stats: [],
    pending: true,
  },
];

// What the Rust core powers, shown on the constellation's core. Each entry restates a fact from
// content.ts: Maya2C is written in Rust, the systems layer is the stated focus, and the security
// research project is tagged Rust. No new claims.
export const CORE_POWERS: readonly string[] = [
  `${FEATURED_PROJECT.name}: Layer-1 blockchain`,
  'Systems layer: protocols & security',
  PROJECTS[1].badge,
];
