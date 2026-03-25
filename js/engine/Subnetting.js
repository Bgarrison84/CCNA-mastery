/**
 * Subnetting.js — IPv4/IPv6 Problem Generator & Validator
 *
 * generateIPv4Problem(difficulty) → { ip, cidr, answers: { networkId, broadcast, firstUsable, lastUsable, totalHosts } }
 * validateIPv4(userAnswers, correct) → { pass, errors }
 * generateIPv6Problem() → similar for IPv6
 */

// ─── IPv4 Utilities ───────────────────────────────────────────────────────────

/** Convert dotted-decimal to 32-bit integer */
function ipToInt(ip) {
  return ip.split('.').reduce((acc, oct) => (acc << 8) | parseInt(oct, 10), 0) >>> 0;
}

/** Convert 32-bit integer to dotted-decimal */
function intToIp(n) {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join('.');
}

/** CIDR prefix to 32-bit subnet mask */
function cidrToMask(cidr) {
  return cidr === 0 ? 0 : (0xffffffff << (32 - cidr)) >>> 0;
}

/** 32-bit subnet mask to CIDR prefix length */
function maskToCidr(mask) {
  let n = mask >>> 0, count = 0;
  while (n) { count += n & 1; n >>>= 1; }
  return count;
}

/** 32-bit mask to dotted-decimal */
function maskToStr(mask) {
  return intToIp(mask);
}

/** Wild-card mask (inverse) */
function wildcardMask(cidr) {
  return intToIp(~cidrToMask(cidr) >>> 0);
}

/**
 * Solve all subnet values from an IP and CIDR prefix.
 * @param {string} ip
 * @param {number} cidr
 * @returns {object}
 */
export function solveSubnet(ip, cidr) {
  const ipInt     = ipToInt(ip);
  const mask      = cidrToMask(cidr);
  const netInt    = (ipInt & mask) >>> 0;
  const bcastInt  = (netInt | (~mask >>> 0)) >>> 0;
  const firstInt  = cidr <= 30 ? netInt + 1 : netInt;
  const lastInt   = cidr <= 30 ? bcastInt - 1 : bcastInt;
  const totalHosts = cidr <= 30 ? Math.pow(2, 32 - cidr) - 2 : cidr === 31 ? 2 : 1;

  return {
    ip,
    cidr,
    subnetMask:   maskToStr(mask),
    wildcardMask: wildcardMask(cidr),
    networkId:    intToIp(netInt),
    broadcast:    intToIp(bcastInt),
    firstUsable:  intToIp(firstInt),
    lastUsable:   intToIp(lastInt),
    totalHosts,
  };
}

// ─── Difficulty-Aware Problem Generator ──────────────────────────────────────

const DIFFICULTY_RANGES = {
  easy:   { cidrMin: 24, cidrMax: 28, classful: true },
  medium: { cidrMin: 19, cidrMax: 28, classful: false },
  hard:   { cidrMin: 16, cidrMax: 30, classful: false },
};

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate a random IPv4 subnetting problem.
 * @param {'easy'|'medium'|'hard'} difficulty
 * @returns {{ ip: string, cidr: number, question: string, answers: object, hints: string[] }}
 */
export function generateIPv4Problem(difficulty = 'medium') {
  const range = DIFFICULTY_RANGES[difficulty] || DIFFICULTY_RANGES.medium;
  const cidr  = randInt(range.cidrMin, range.cidrMax);

  // Generate a sensible host IP (not .0 or .255 in last octet)
  const oct1  = range.classful ? [10, 172, 192][randInt(0, 2)] : randInt(1, 223);
  const oct2  = randInt(0, 255);
  const oct3  = randInt(0, 255);
  const oct4  = randInt(1, 254);
  const ip    = `${oct1}.${oct2}.${oct3}.${oct4}`;

  const answers = solveSubnet(ip, cidr);

  const hints = [
    `The subnet mask for /${cidr} is ${answers.subnetMask}`,
    `The wildcard mask is ${answers.wildcardMask}`,
    `There are ${answers.totalHosts} usable host addresses`,
    `Network address ends in 0 bits for the host portion (/${cidr} → host bits: ${32 - cidr})`,
  ];

  return {
    ip,
    cidr,
    notation: `${ip}/${cidr}`,
    question: `Given the IP address ${ip}/${cidr}, calculate:`,
    fields: ['networkId', 'subnetMask', 'broadcast', 'firstUsable', 'lastUsable', 'totalHosts'],
    answers,
    hints,
  };
}

/**
 * Validate user-submitted answers against correct values.
 * @param {object} userAnswers  - { networkId, subnetMask, broadcast, firstUsable, lastUsable, totalHosts }
 * @param {object} correct      - result of solveSubnet()
 * @returns {{ pass: boolean, score: number, errors: object }}
 */
export function validateIPv4(userAnswers, correct) {
  const fields = ['networkId', 'subnetMask', 'broadcast', 'firstUsable', 'lastUsable'];
  const errors = {};
  let passed = 0;

  for (const field of fields) {
    const user = (userAnswers[field] || '').trim();
    const exp  = correct[field];
    if (user === exp) {
      passed++;
    } else {
      errors[field] = { user, expected: exp };
    }
  }

  // totalHosts: accept numeric string
  const userHosts = parseInt(userAnswers.totalHosts, 10);
  if (!isNaN(userHosts) && userHosts === correct.totalHosts) {
    passed++;
  } else {
    errors.totalHosts = { user: userAnswers.totalHosts, expected: correct.totalHosts };
  }

  const total = fields.length + 1;
  const score = Math.round((passed / total) * 100);
  return { pass: Object.keys(errors).length === 0, score, errors, passed, total };
}

// ─── VLSM Utility ─────────────────────────────────────────────────────────────

/**
 * Calculate VLSM subnets from a base network and a list of host requirements.
 * Subnets are allocated largest-first.
 *
 * @param {string} baseNetwork  - e.g., '192.168.1.0'
 * @param {number} baseCidr     - e.g., 24
 * @param {number[]} hostReqs   - e.g., [50, 25, 10, 2]
 * @returns {object[]}          - array of solved subnets
 */
export function calculateVLSM(baseNetwork, baseCidr, hostReqs) {
  const sorted = [...hostReqs].sort((a, b) => b - a);
  const results = [];
  let currentNet = ipToInt(baseNetwork);

  for (const hosts of sorted) {
    // Find smallest CIDR that fits 'hosts' usable addresses
    let cidr = 30;
    while (cidr > 1 && (Math.pow(2, 32 - cidr) - 2) < hosts) cidr--;

    const subnet = solveSubnet(intToIp(currentNet), cidr);
    results.push({ ...subnet, requestedHosts: hosts });

    // Next subnet starts after broadcast
    currentNet = ipToInt(subnet.broadcast) + 1;
  }

  return results;
}

// ─── IPv6 Utilities ───────────────────────────────────────────────────────────

/**
 * Generate a basic IPv6 subnetting problem.
 * Simplified: works with /48, /56, /64 boundaries.
 */
export function generateIPv6Problem() {
  const prefixes = [48, 56, 64];
  const cidr     = prefixes[randInt(0, 2)];

  const groups   = Array.from({ length: 8 }, () => randInt(0, 0xffff).toString(16).padStart(4, '0'));
  const ip       = groups.join(':');

  // Zero out host portion
  const fullGroups = 8;
  const netGroups  = Math.ceil(cidr / 16);
  const netPart    = groups.slice(0, netGroups).map((g, i) => {
    const bits = cidr - i * 16;
    if (bits >= 16) return g;
    const mask = 0xffff << (16 - bits) & 0xffff;
    return (parseInt(g, 16) & mask).toString(16).padStart(4, '0');
  });
  const networkId = [...netPart, ...Array(fullGroups - netGroups).fill('0000')].join(':');

  return {
    ip,
    cidr,
    notation: `${ip}/${cidr}`,
    question: `Given ${ip}/${cidr}, what is the network address?`,
    answers: { networkId, prefixLength: cidr },
    hints: [
      `/${cidr} means the first ${cidr} bits identify the network`,
      `IPv6 addresses are 128 bits, split into 8 groups of 16 bits`,
      `Zero out all bits after bit ${cidr}`,
    ],
  };
}

/**
 * Validate an IPv6 network ID answer.
 * Normalizes both strings before comparing (lowercase, expand ::, etc.)
 */
export function validateIPv6(userAnswer, correct) {
  const normalize = (addr) => {
    // Expand :: shorthand
    if (addr.includes('::')) {
      const halves = addr.split('::');
      const left   = halves[0] ? halves[0].split(':') : [];
      const right  = halves[1] ? halves[1].split(':') : [];
      const fill   = 8 - left.length - right.length;
      const full   = [...left, ...Array(fill).fill('0000'), ...right];
      return full.map(g => g.padStart(4, '0')).join(':').toLowerCase();
    }
    return addr.split(':').map(g => g.padStart(4, '0')).join(':').toLowerCase();
  };

  const pass = normalize(userAnswer) === normalize(correct.networkId);
  return { pass, expected: correct.networkId };
}

// ─── Subnetting Challenge Builder ─────────────────────────────────────────────

/**
 * Build a timed challenge session with N problems.
 * Returns an object with { problems[], check(idx, answers) → result }
 */
export function buildChallenge(count = 5, difficulty = 'medium') {
  const problems = Array.from({ length: count }, () => generateIPv4Problem(difficulty));
  let hintsUsed  = 0;

  return {
    problems,
    /** @param {number} idx  @param {object} answers */
    check(idx, answers) {
      return validateIPv4(answers, problems[idx].answers);
    },
    getHint(idx, hintIdx = 0) {
      hintsUsed++;
      return problems[idx].hints[hintIdx] || 'No more hints available.';
    },
    get hintsUsed() { return hintsUsed; },
  };
}
