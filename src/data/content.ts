// Single source for every fact on the site. Rewrite presentation, never these facts.

export const SITE_URL = 'https://eric.maya2c.dev';
export const SITE_TITLE = 'Eric Wijesinghe — Rust Dev & Security Researcher';
export const SITE_DESCRIPTION =
  'Eric Wijesinghe — Rust developer, security researcher, and creator of Maya2C, a post-quantum Layer-1 blockchain.';

export const ROLES = ['Rust-First Engineer', 'Founder & Builder', 'Security Researcher'] as const;

export const ABOUT_PARAGRAPHS = [
  "I'm an independent developer and self-directed learner. Growth is limited by complexity, not by knowledge.",
  "Rust is my primary language. It makes you think correctly about memory, ownership, and concurrency. The compiler is the strictest teacher I've had.",
  'I work at the systems layer: network protocols, binary analysis, threat detection, and AI-assisted security tooling. Right now I am building Maya2C, a post-quantum blockchain designed from the ground up.',
] as const;

export const STATS = [
  { value: 'Rust', label: 'Primary language' },
  { value: 'AI+', label: 'Security focus' },
  { value: '∞', label: 'Learning mode: on' },
  { value: 'PQ', label: 'Post-quantum by default' },
] as const;

export const FEATURED_PROJECT = {
  name: 'Maya2C',
  badge: 'flagship · public testnet',
  description:
    'A post-quantum Layer-1 blockchain written in Rust. It reaches deterministic finality through DAG-BFT consensus and secures every transaction with two NIST post-quantum signatures, ML-DSA-65 and SLH-DSA. Built to stay safe after large-scale quantum computers arrive.',
  tags: ['Rust', 'Post-Quantum', 'DAG-BFT', 'ML-DSA-65', 'SLH-DSA', 'Layer-1'],
  spec: [
    ['consensus', 'DAG-BFT'],
    ['signatures', 'ML-DSA-65 + SLH-DSA'],
    ['language', 'Rust'],
    ['license', 'Apache-2.0'],
  ],
  links: [
    { label: 'visit maya2c.dev', href: 'https://maya2c.dev' },
    { label: 'GitHub', href: 'https://github.com/EricWijesinghe/Maya2C' },
  ],
} as const;

// UNICRON is a private repository: it is described, never linked.
export const PROJECTS = [
  {
    name: 'UNICRON',
    badge: 'security platform · private repo',
    description:
      'A modular-monolith cybersecurity platform built entirely in Rust: threat detection, network analysis, and AI-assisted security intelligence.',
    tags: ['Rust', 'AI/ML', 'Threat Detection'],
    href: null,
  },
  {
    name: 'Security Research',
    badge: 'security tooling',
    description:
      'Vulnerability research, binary analysis, and offensive/defensive security tooling. Exploring the boundary between AI and traditional security methodology.',
    tags: ['Rust', 'Binary Analysis', 'CVE Research'],
    href: 'https://github.com/EricWijesinghe',
  },
  {
    name: 'AI × Security',
    badge: 'ai engineering',
    description:
      'Integrating LLM capabilities into security workflows: automated threat intelligence, AI-assisted code auditing, and anomaly detection.',
    tags: ['LLMs', 'Rust', 'Claude API', 'Agents'],
    href: 'https://github.com/EricWijesinghe',
  },
] as const;

// x/y are positions on a 1000x640 constellation canvas; the core sits at 500,320.
export const SKILL_GROUPS = [
  {
    name: 'Systems',
    items: ['Rust', 'Memory safety', 'Ownership', 'Concurrency', 'FFI', 'Cargo ecosystem'],
    x: 500,
    y: 90,
  },
  {
    name: 'Security',
    items: ['Threat detection', 'Network analysis', 'Binary exploitation', 'CVE research', 'Malware analysis'],
    x: 140,
    y: 210,
  },
  {
    name: 'AI Engineering',
    items: ['LLM integration', 'Claude API', 'Agentic systems', 'RAG', 'Security-focused AI'],
    x: 860,
    y: 210,
  },
  {
    name: 'Networking',
    items: ['TCP/IP', 'Protocol analysis', 'Packet inspection', 'Network security', 'async Rust'],
    x: 150,
    y: 520,
  },
  {
    name: 'Tooling',
    items: ['Linux', 'Git', 'Docker', 'GDB/LLDB', 'Wireshark', 'Ghidra', 'VS Code'],
    x: 850,
    y: 520,
  },
  {
    name: 'Architecture',
    items: ['Modular monolith', 'API design', 'Systems design', 'Performance engineering'],
    x: 500,
    y: 560,
  },
] as const;

export const SOCIALS = [
  { label: 'GitHub', href: 'https://github.com/EricWijesinghe', icon: 'github' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/ericwijesinghe', icon: 'linkedin' },
  { label: 'Facebook', href: 'https://www.facebook.com/EricWijesinghe2002/', icon: 'facebook' },
  { label: 'Instagram', href: 'https://www.instagram.com/ericwijesinghe2022/', icon: 'instagram' },
] as const;

export const CONTACT_TEXT =
  "Open to security research collaborations, Rust consulting, and interesting problems at the intersection of AI and cybersecurity. Build something serious? Let's talk.";
