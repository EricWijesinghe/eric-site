// Single source for every fact and link on the site. Rewrite presentation, never these facts.

export const SITE_URL = 'https://eric.maya2c.dev';
export const SITE_TITLE = 'Eric Wijesinghe — Rust Dev & Security Researcher';
export const SITE_DESCRIPTION =
  'Eric Wijesinghe — Rust developer, security researcher, and creator of Maya2C, a post-quantum Layer-1 blockchain.';

export const OG_IMAGE_ALT = 'Eric Wijesinghe, Rust developer and security researcher, creator of Maya2C';

export const GITHUB_PROFILE = 'https://github.com/EricWijesinghe';
export const MAYA2C_SITE = 'https://maya2c.dev';
export const MAYA2C_REPO = 'https://github.com/EricWijesinghe/Maya2C';
// Public, and the one written contact route: no email address is published here.
export const MAYA2C_DISCUSSIONS = 'https://github.com/EricWijesinghe/Maya2C/discussions';

// Support: no donation account exists yet. Set this to a real URL (GitHub Sponsors,
// Buy Me a Coffee, ...) and the donate button appears in the Support block. Until then
// the block links only to the GitHub repo.
export const DONATION_URL: string | null = null;

export const ROLES = ['Rust-First Engineer', 'Founder & Builder', 'Security Researcher'] as const;

export const ABOUT_PARAGRAPHS = [
  "I'm an independent developer and self-directed learner. Growth is limited by complexity, not by knowledge.",
  "Rust is my primary language. It makes you think correctly about memory, ownership, and concurrency. The compiler is the strictest teacher I've had.",
  'I work at the systems layer: network protocols, binary analysis, threat detection, and AI-assisted security tooling. Right now I am building Maya2C, a post-quantum blockchain designed from the ground up.',
] as const;

// Facts, not numbers: each one is checkable in the public Maya2C repository.
export const STATS = [
  { value: 'Rust', label: 'Primary language' },
  { value: 'PQ', label: 'Post-quantum by default' },
  { value: 'BFT', label: 'DAG-BFT finality' },
  { value: 'OSS', label: 'Apache-2.0, in the open' },
] as const;

export const FEATURED_PROJECT = {
  name: 'Maya2C',
  badge: 'flagship · testnet paused, mainnet not live',
  description:
    'A post-quantum Layer-1 blockchain written in Rust. It reaches deterministic finality through DAG-BFT consensus and secures every transaction with two NIST post-quantum signatures, ML-DSA-65 and SLH-DSA. Built to stay safe after large-scale quantum computers arrive.',
  tags: ['Rust', 'Post-Quantum', 'DAG-BFT', 'ML-DSA-65', 'SLH-DSA', 'Layer-1'],
  spec: [
    ['consensus', 'DAG-BFT'],
    ['signatures', 'ML-DSA-65 + SLH-DSA'],
    ['language', 'Rust'],
    ['license', 'Apache-2.0'],
  ],
  // Stated wherever Maya2C is presented (owner's standing disclosure).
  disclosure:
    'Pre-audit: no external audit yet. Validators are run by one operator at launch. An external audit is planned after funding.',
  links: [
    { label: 'Visit maya2c.dev', href: MAYA2C_SITE },
    { label: 'Source on GitHub', href: MAYA2C_REPO },
  ],
} as const;

// UNICRON is a private repository: it is described, never linked. The two focus areas have
// no public repository yet, so they carry a note instead of a link that leads nowhere.
export const PROJECTS = [
  {
    name: 'UNICRON',
    badge: 'security platform · private repo',
    description:
      'A modular-monolith cybersecurity platform built entirely in Rust: threat detection, network analysis, and AI-assisted security intelligence.',
    tags: ['Rust', 'AI/ML', 'Threat Detection'],
    href: null,
    note: 'Private repository.',
  },
  {
    name: 'Security Research',
    badge: 'security tooling',
    description:
      'Vulnerability research, binary analysis, and offensive/defensive security tooling. Exploring the boundary between AI and traditional security methodology.',
    tags: ['Rust', 'Fuzzing', 'Threat Modelling'],
    href: null,
    note: 'Focus area: no public repository yet.',
  },
  {
    name: 'AI × Security',
    badge: 'ai engineering',
    description:
      'Integrating LLM capabilities into security workflows: automated threat intelligence, AI-assisted code auditing, and anomaly detection.',
    tags: ['LLMs', 'Rust', 'Claude API', 'Agents'],
    href: null,
    note: 'Focus area: no public repository yet.',
  },
] as const;

// `line` is the one-line summary shown on the orbit; `items` open on click.
export const SKILL_GROUPS = [
  {
    name: 'Systems',
    items: ['Rust', 'Memory safety', 'Ownership', 'Concurrency', 'FFI', 'Cargo ecosystem'],
    line: 'Memory-safe, concurrent Rust',
  },
  {
    name: 'Security',
    items: ['Threat detection', 'Network analysis', 'Fuzzing', 'Binary analysis', 'Malware analysis'],
    line: 'Find it before attackers do',
  },
  {
    name: 'AI Engineering',
    items: ['LLM integration', 'Claude API', 'Agentic systems', 'RAG', 'Security-focused AI'],
    line: 'Models wired into real tools',
  },
  {
    name: 'Networking',
    items: ['TCP/IP', 'Protocol analysis', 'Packet inspection', 'Network security', 'async Rust'],
    line: 'Protocols down to the packet',
  },
  {
    name: 'Tooling',
    items: ['Linux', 'Git', 'Docker', 'GDB/LLDB', 'Wireshark', 'Ghidra', 'VS Code'],
    line: 'Debuggers, disassemblers, sniffers',
  },
  {
    name: 'Architecture',
    items: ['Modular monolith', 'API design', 'Systems design', 'Performance engineering'],
    line: 'Systems shaped to last',
  },
] as const;

export const SOCIALS = [
  { label: 'GitHub', href: GITHUB_PROFILE, icon: 'github' },
  // LinkedIn is left out until its public URL is confirmed: /in/ericwijesinghe answered 999
  // (blocked or missing) to logged-out checks on 2026-11-14. Add it back with the real slug.
  { label: 'Facebook', href: 'https://www.facebook.com/EricWijesinghe2002/', icon: 'facebook' },
  { label: 'Instagram', href: 'https://www.instagram.com/ericwijesinghe2022/', icon: 'instagram' },
] as const;

export const CONTACT_TEXT =
  "Open to security research collaborations, Rust consulting, and interesting problems at the intersection of AI and cybersecurity. Start a thread on GitHub Discussions.";
