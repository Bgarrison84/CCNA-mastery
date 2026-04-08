/**
 * Subnetting.test.js — Unit tests for js/engine/Subnetting.js
 *
 * Covers: solveSubnet, validateIPv4, calculateVLSM, validateIPv6, buildChallenge
 */
import { describe, it, expect } from 'vitest';
import {
  solveSubnet,
  validateIPv4,
  calculateVLSM,
  validateIPv6,
  generateIPv4Problem,
  buildChallenge,
} from '../js/engine/Subnetting.js';

// ─── solveSubnet ──────────────────────────────────────────────────────────────

describe('solveSubnet', () => {
  it('correctly solves a /24 network', () => {
    const r = solveSubnet('192.168.1.100', 24);
    expect(r.networkId).toBe('192.168.1.0');
    expect(r.broadcast).toBe('192.168.1.255');
    expect(r.firstUsable).toBe('192.168.1.1');
    expect(r.lastUsable).toBe('192.168.1.254');
    expect(r.subnetMask).toBe('255.255.255.0');
    expect(r.totalHosts).toBe(254);
  });

  it('correctly solves a /26 network', () => {
    const r = solveSubnet('10.0.0.50', 26);
    expect(r.networkId).toBe('10.0.0.0');
    expect(r.broadcast).toBe('10.0.0.63');
    expect(r.firstUsable).toBe('10.0.0.1');
    expect(r.lastUsable).toBe('10.0.0.62');
    expect(r.subnetMask).toBe('255.255.255.192');
    expect(r.totalHosts).toBe(62);
  });

  it('correctly solves a /30 network (point-to-point)', () => {
    const r = solveSubnet('172.16.5.6', 30);
    expect(r.networkId).toBe('172.16.5.4');
    expect(r.broadcast).toBe('172.16.5.7');
    expect(r.firstUsable).toBe('172.16.5.5');
    expect(r.lastUsable).toBe('172.16.5.6');
    expect(r.totalHosts).toBe(2);
  });

  it('/31 gives 2 hosts (RFC 3021 point-to-point, no broadcast)', () => {
    const r = solveSubnet('10.1.1.0', 31);
    expect(r.totalHosts).toBe(2);
    expect(r.networkId).toBe('10.1.1.0');
  });

  it('/32 gives 1 host (host route)', () => {
    const r = solveSubnet('192.168.1.5', 32);
    expect(r.totalHosts).toBe(1);
    expect(r.networkId).toBe('192.168.1.5');
    expect(r.broadcast).toBe('192.168.1.5');
  });

  it('returns correct wildcardMask', () => {
    const r = solveSubnet('10.0.0.0', 8);
    expect(r.subnetMask).toBe('255.0.0.0');
    expect(r.wildcardMask).toBe('0.255.255.255');
  });

  it('handles host IP that is not on network boundary', () => {
    const r = solveSubnet('192.168.100.200', 25);
    expect(r.networkId).toBe('192.168.100.128');
    expect(r.broadcast).toBe('192.168.100.255');
    expect(r.totalHosts).toBe(126);
  });

  it('echoes back the ip and cidr fields', () => {
    const r = solveSubnet('10.1.2.3', 16);
    expect(r.ip).toBe('10.1.2.3');
    expect(r.cidr).toBe(16);
  });
});

// ─── validateIPv4 ────────────────────────────────────────────────────────────

describe('validateIPv4', () => {
  const correct = solveSubnet('192.168.1.100', 24);

  it('passes when all fields match', () => {
    const result = validateIPv4({
      networkId:   '192.168.1.0',
      subnetMask:  '255.255.255.0',
      broadcast:   '192.168.1.255',
      firstUsable: '192.168.1.1',
      lastUsable:  '192.168.1.254',
      totalHosts:  '254',
    }, correct);
    expect(result.pass).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
    expect(result.score).toBe(100);
  });

  it('fails when networkId is wrong', () => {
    const result = validateIPv4({
      networkId:   '192.168.1.1',  // wrong
      subnetMask:  '255.255.255.0',
      broadcast:   '192.168.1.255',
      firstUsable: '192.168.1.1',
      lastUsable:  '192.168.1.254',
      totalHosts:  '254',
    }, correct);
    expect(result.pass).toBe(false);
    expect(result.errors.networkId).toBeDefined();
    expect(result.errors.networkId.expected).toBe('192.168.1.0');
  });

  it('accepts totalHosts as numeric string', () => {
    const result = validateIPv4({
      networkId:   '192.168.1.0',
      subnetMask:  '255.255.255.0',
      broadcast:   '192.168.1.255',
      firstUsable: '192.168.1.1',
      lastUsable:  '192.168.1.254',
      totalHosts:  254,   // number, not string
    }, correct);
    expect(result.pass).toBe(true);
  });

  it('trims whitespace from user answers', () => {
    const result = validateIPv4({
      networkId:   '  192.168.1.0  ',
      subnetMask:  '255.255.255.0',
      broadcast:   '192.168.1.255',
      firstUsable: '192.168.1.1',
      lastUsable:  '192.168.1.254',
      totalHosts:  '254',
    }, correct);
    expect(result.pass).toBe(true);
  });

  it('returns partial score for partial correctness', () => {
    const result = validateIPv4({
      networkId:   '192.168.1.0',   // correct
      subnetMask:  '255.255.255.0', // correct
      broadcast:   '192.168.1.0',   // wrong
      firstUsable: '192.168.1.1',   // correct
      lastUsable:  '192.168.1.254', // correct
      totalHosts:  '254',           // correct
    }, correct);
    expect(result.pass).toBe(false);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
    expect(result.passed).toBe(5);
    expect(result.total).toBe(6);
  });
});

// ─── calculateVLSM ───────────────────────────────────────────────────────────

describe('calculateVLSM', () => {
  it('allocates subnets largest-first', () => {
    const subnets = calculateVLSM('192.168.1.0', 24, [50, 25, 10, 2]);
    expect(subnets).toHaveLength(4);
    // Largest (50 hosts) gets first allocation
    expect(subnets[0].requestedHosts).toBe(50);
    expect(subnets[0].totalHosts).toBeGreaterThanOrEqual(50);
  });

  it('subnets do not overlap', () => {
    const subnets = calculateVLSM('10.0.0.0', 24, [100, 50, 20]);
    // Each subnet's networkId must be greater than previous broadcast
    for (let i = 1; i < subnets.length; i++) {
      const prevBcast = subnets[i-1].broadcast.split('.').reduce((a, b) => (a << 8) | +b, 0) >>> 0;
      const currNet   = subnets[i].networkId.split('.').reduce((a, b) => (a << 8) | +b, 0) >>> 0;
      expect(currNet).toBeGreaterThan(prevBcast);
    }
  });

  it('each subnet has enough usable hosts', () => {
    const subnets = calculateVLSM('172.16.0.0', 24, [60, 30, 14]);
    subnets.forEach(s => {
      expect(s.totalHosts).toBeGreaterThanOrEqual(s.requestedHosts);
    });
  });

  it('handles single subnet requirement', () => {
    const subnets = calculateVLSM('10.10.0.0', 16, [500]);
    expect(subnets).toHaveLength(1);
    expect(subnets[0].totalHosts).toBeGreaterThanOrEqual(500);
  });
});

// ─── validateIPv6 ────────────────────────────────────────────────────────────

describe('validateIPv6', () => {
  const correct = { networkId: '2001:0db8:0000:0000:0000:0000:0000:0000' };

  it('accepts fully expanded correct answer', () => {
    const r = validateIPv6('2001:0db8:0000:0000:0000:0000:0000:0000', correct);
    expect(r.pass).toBe(true);
  });

  it('accepts :: shorthand', () => {
    const r = validateIPv6('2001:db8::', correct);
    expect(r.pass).toBe(true);
  });

  it('is case-insensitive', () => {
    const r = validateIPv6('2001:0DB8::', correct);
    expect(r.pass).toBe(true);
  });

  it('fails on wrong network', () => {
    const r = validateIPv6('2001:0db9::', correct);
    expect(r.pass).toBe(false);
  });
});

// ─── generateIPv4Problem ─────────────────────────────────────────────────────

describe('generateIPv4Problem', () => {
  it('returns a well-formed problem object', () => {
    const p = generateIPv4Problem('medium');
    expect(p).toHaveProperty('ip');
    expect(p).toHaveProperty('cidr');
    expect(p).toHaveProperty('answers');
    expect(p.answers).toHaveProperty('networkId');
    expect(p.answers).toHaveProperty('broadcast');
    expect(p.answers).toHaveProperty('subnetMask');
    expect(p.hints).toHaveLength(4);
  });

  it('generates easy problems in /24–/28 range', () => {
    for (let i = 0; i < 20; i++) {
      const p = generateIPv4Problem('easy');
      expect(p.cidr).toBeGreaterThanOrEqual(24);
      expect(p.cidr).toBeLessThanOrEqual(28);
    }
  });

  it('generated answers pass self-validation', () => {
    for (let i = 0; i < 10; i++) {
      const p = generateIPv4Problem('hard');
      const result = validateIPv4({
        networkId:   p.answers.networkId,
        subnetMask:  p.answers.subnetMask,
        broadcast:   p.answers.broadcast,
        firstUsable: p.answers.firstUsable,
        lastUsable:  p.answers.lastUsable,
        totalHosts:  String(p.answers.totalHosts),
      }, p.answers);
      expect(result.pass).toBe(true);
    }
  });
});

// ─── buildChallenge ──────────────────────────────────────────────────────────

describe('buildChallenge', () => {
  it('creates a challenge with the requested count', () => {
    const c = buildChallenge(3, 'easy');
    expect(c.problems).toHaveLength(3);
  });

  it('check() returns correct result for matching answers', () => {
    const c = buildChallenge(1, 'medium');
    const p = c.problems[0];
    const res = c.check(0, {
      networkId:   p.answers.networkId,
      subnetMask:  p.answers.subnetMask,
      broadcast:   p.answers.broadcast,
      firstUsable: p.answers.firstUsable,
      lastUsable:  p.answers.lastUsable,
      totalHosts:  String(p.answers.totalHosts),
    });
    expect(res.pass).toBe(true);
  });

  it('tracks hints used', () => {
    const c = buildChallenge(2);
    expect(c.hintsUsed).toBe(0);
    c.getHint(0, 0);
    c.getHint(0, 1);
    expect(c.hintsUsed).toBe(2);
  });

  it('getHint returns fallback for out-of-range index', () => {
    const c = buildChallenge(1);
    expect(c.getHint(0, 99)).toBe('No more hints available.');
  });
});
