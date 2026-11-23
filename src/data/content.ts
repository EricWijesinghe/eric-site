// Single source for every fact and link on the site. Rewrite presentation, never these facts.

export const SITE_URL = 'https://eric.maya2c.dev';
// Head metadata only. Visible copy (hero, footer) is owner-approved and lives in the components.
export const SITE_TITLE = 'Eric Wijesinghe — Rust Developer, Security Research, Maya2C';
export const SITE_DESCRIPTION =
  'Eric Wijesinghe — Rust developer, security researcher, and creator of Maya2C, a pre-mainnet post-quantum Layer-1 blockchain.';

export const OG_IMAGE_ALT = 'Eric Wijesinghe, Rust developer and security researcher, creator of Maya2C';

export const GITHUB_PROFILE = 'https://github.com/EricWijesinghe';
// The public GitHub handle, used as Person.alternateName.
export const GITHUB_USERNAME = 'EricWijesinghe';
export const APACHE_2_LICENSE_URL = 'https://www.apache.org/licenses/LICENSE-2.0';
export const MAYA2C_SITE = 'https://maya2c.dev';
export const MAYA2C_REPO = 'https://github.com/EricWijesinghe/Maya2C';
// Public, and the one written contact route: no email address is published here.
export const MAYA2C_CONTRIBUTING = 'https://github.com/EricWijesinghe/Maya2C/blob/master/CONTRIBUTING.md';
export const MAYA2C_DISCUSSIONS = 'https://github.com/EricWijesinghe/Maya2C/discussions';

// Support: no donation account exists yet. Set this to a real URL (GitHub Sponsors,
// Buy Me a Coffee, ...) and the donate button appears in the Support block. Until then
// the block links only to the GitHub repo.
export const DONATION_URL: string | null = null;

export const ROLES = ['Rust-First Engineer', 'Founder & Builder', 'Security Researcher'] as const;

export const ABOUT_PARAGRAPHS = [
  "I'm an independent developer and self-directed learner. Growth is limited by complexity, not by knowledge.",
  "Rust is my primary language. It makes you think correctly about memory, ownership, and concurrency. The compiler is the strictest teacher I've had.",
  'My focus is the systems layer: network protocols, security, and where AI fits into security work. Right now I am building Maya2C, a Layer-1 blockchain that uses NIST post-quantum signatures (FIPS 204, FIPS 205).',
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
    'A post-quantum Layer-1 blockchain written in Rust. It reaches deterministic finality through DAG-BFT consensus, and each transaction is signed with two NIST post-quantum schemes, ML-DSA (FIPS 204) and SLH-DSA (FIPS 205), both of which must verify.',
  tags: ['Rust', 'Post-Quantum', 'DAG-BFT', 'ML-DSA', 'SLH-DSA', 'Layer-1'],
  spec: [
    ['consensus', 'DAG-BFT'],
    // No parameter set: the repo's README and ADRs name different ones (65 vs 87) for different keys.
    ['signatures', 'ML‑DSA + SLH‑DSA'], // U+2011: the names never break at the hyphen
    ['language', 'Rust'],
    ['license', 'Apache-2.0'],
  ],
  // Stated wherever Maya2C is presented (owner's standing disclosure).
  disclosure:
    'Pre-audit: no external audit yet. Validators are run by one operator at launch. An external audit is planned after funding.',
  links: [
    { label: 'Maya2C details', href: '/maya2c' },
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
      // Worded from the private repo's own GitHub description; no language claim (metadata says mostly HTML).
      'A security assessment and pentesting platform, kept in a private repository while it takes shape.',
    tags: ['Security assessment', 'Pentesting'],
    href: null,
    note: 'Private repository.',
  },
  {
    name: 'Security Research',
    badge: 'security tooling',
    description:
      'Where I want to go deeper: security research, and how AI fits next to traditional security methods.',
    tags: ['Security', 'Rust'],
    href: null,
    note: 'Focus area: no public repository yet.',
  },
  {
    name: 'AI × Security',
    badge: 'ai engineering',
    description:
      'Where I want to go deeper: language models used inside security workflows.',
    tags: ['LLMs', 'Security'],
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
    // Fuzzing is in the public Maya2C repo (fuzz/ targets); unevidenced skills stay off until shown.
    items: ['Threat detection', 'Network analysis', 'Fuzzing'],
    line: 'Find it before attackers do',
  },
  {
    name: 'AI Engineering',
    items: ['LLM integration', 'AI-assisted development'],
    line: 'Models as working tools',
  },
  {
    name: 'Networking',
    items: ['TCP/IP', 'Protocol analysis', 'Packet inspection', 'Network security', 'async Rust'],
    line: 'Protocols down to the packet',
  },
  {
    name: 'Tooling',
    items: ['Linux', 'Git', 'Docker', 'GDB/LLDB', 'Wireshark', 'VS Code'],
    line: 'Debuggers, containers, sniffers',
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
