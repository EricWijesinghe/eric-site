// Where each skill acts in the life of one change. Presentation data for the skills loop: the names come
// from content.ts SKILL_GROUPS and the type below makes a renamed or missing skill a build error. Each
// "how" is a general technical statement about the tool or idea, never a claim about Eric's work.
import { SKILL_GROUPS } from './content';

export type SkillName = (typeof SKILL_GROUPS)[number]['items'][number];

export const PHASES = [
  { name: 'WRITE', line: 'Draw the boundaries, then write inside them.', glyphs: ['fn', 'mod', 'impl', 'pub', '+', '-'] },
  { name: 'CHECK', line: 'Checked by the compiler before anything runs.', glyphs: ['&', '&mut', 'move', "'a", 'Send', 'Sync'] },
  { name: 'RUN', line: 'Many tasks, one machine, measured.', glyphs: ['async', '.await', 'spawn', 'poll', 'join'] },
  { name: 'TRACE', line: 'Read what really crosses the wire.', glyphs: ['SYN', 'SYN-ACK', 'ACK', 'seq', 'ack', 'ttl'] },
  { name: 'BREAK', line: 'Find it before attackers do.', glyphs: ['0110', '0111', '0xFF', '\\x00'] },
] as const;

export type PhaseName = (typeof PHASES)[number]['name'];

/** CORE is the Rust node at the centre of the loop; every other skill sits in one phase. */
export const SKILL_LOOP = {
  Rust: { phase: 'CORE', how: 'no garbage collector: lifetimes are checked at compile time' },
  'Memory safety': { phase: 'CHECK', how: 'safe Rust: no use-after-free, no data race' },
  Ownership: { phase: 'CHECK', how: 'one owner per value; a move ends the old binding' },
  FFI: { phase: 'CHECK', how: 'extern "C": the unsafe boundary, kept small' },
  'Cargo ecosystem': { phase: 'CHECK', how: 'Cargo.lock pins the exact version of every dependency' },
  Concurrency: { phase: 'RUN', how: 'Send and Sync decide what may cross a thread' },
  'async Rust': { phase: 'RUN', how: 'a future does nothing until polled; .await is where it yields' },
  Linux: { phase: 'RUN', how: 'syscalls: the door from user space into the kernel' },
  Docker: { phase: 'RUN', how: 'namespaces and cgroups isolate a process tree' },
  'Performance engineering': { phase: 'RUN', how: 'measure, profile, change one thing, measure' },
  'LLM integration': { phase: 'RUN', how: 'model output is untrusted input: validate it' },
  'TCP/IP': { phase: 'TRACE', how: 'SYN, SYN-ACK, ACK: then bytes in order' },
  'Protocol analysis': { phase: 'TRACE', how: 'recover the state machine from the bytes' },
  'Packet inspection': { phase: 'TRACE', how: 'ethernet | ip | tcp | payload' },
  Wireshark: { phase: 'TRACE', how: 'capture, dissect, follow the stream' },
  'Network analysis': { phase: 'TRACE', how: 'flows first: who talks to whom' },
  Fuzzing: { phase: 'BREAK', how: 'mutate, run, keep inputs that reach new code' },
  'Threat detection': { phase: 'BREAK', how: 'learn the baseline, flag what deviates' },
  'Network security': { phase: 'BREAK', how: 'treat the network as hostile: authenticate, then encrypt' },
  'GDB/LLDB': { phase: 'BREAK', how: 'breakpoint, backtrace, the faulting frame' },
  Git: { phase: 'WRITE', how: 'history as a graph of content-addressed commits' },
  'VS Code': { phase: 'WRITE', how: 'edit, jump to definition, debug in place' },
  'AI-assisted development': { phase: 'WRITE', how: 'the model drafts; compiler and tests decide' },
  'Modular monolith': { phase: 'WRITE', how: 'one deployable, hard module boundaries' },
  'API design': { phase: 'WRITE', how: 'the contract: small, typed, stable' },
  'Systems design': { phase: 'WRITE', how: 'components, data flow, failure modes' },
} as const satisfies Record<SkillName, { phase: PhaseName | 'CORE'; how: string }>;

/** One skill as the loop draws it: phase index (-1 for the core), group index and ring angle in radians. */
export interface Star {
  name: SkillName;
  group: number;
  phase: number;
  how: string;
  angle: number;
}

const TAU = Math.PI * 2;
/** Each phase owns an equal arc of the ring. */
export const PHASE_ARC = TAU / PHASES.length;

/** Two-digit ordinal from an index, so no "01" is ever typed by hand. */
export const ordinal = (i: number): string => String(i + 1).padStart(2, '0');

function buildStars(): { ring: Star[]; core: Star } {
  const all: Star[] = [];
  SKILL_GROUPS.forEach((g, group) =>
    g.items.forEach((name) => {
      const entry = SKILL_LOOP[name];
      const phase = PHASES.findIndex((p) => p.name === entry.phase);
      all.push({ name, group, phase, how: entry.how, angle: 0 });
    }),
  );
  const ring: Star[] = [];
  PHASES.forEach((_, p) => {
    // Group order inside a phase keeps one hue together; content.ts order breaks ties (sort is stable).
    const members = all.filter((s) => s.phase === p).sort((a, b) => a.group - b.group);
    members.forEach((s, j) => ring.push({ ...s, angle: p * PHASE_ARC + ((j + 0.5) * PHASE_ARC) / members.length }));
  });
  const core = all.find((s) => s.phase === -1);
  if (!core) throw new Error('spectrum: the loop needs a core skill');
  return { ring, core };
}

const built = buildStars();
/** The ring stars, in ring order (phase, then group). */
export const RING: readonly Star[] = built.ring;
/** The Rust core. */
export const CORE: Star = built.core;
/** Every skill, core first: index into this is the star id used across the scene and the DOM. */
export const ALL_STARS: readonly Star[] = [built.core, ...built.ring];
export const starId = (name: string): number => ALL_STARS.findIndex((s) => s.name === name);
