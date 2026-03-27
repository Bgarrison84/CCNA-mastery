/**
 * ScriptingEngine.js — Network Automation Scripting Lab Validator
 *
 * Validates Python and Bash scripts against a set of pattern checks
 * without executing code. Works 100% offline — no WASM or runtime needed.
 *
 * Each lab defines an array of checks:
 *   { label: string, test: RegExp | (code) => bool, required: bool }
 *
 * validate(code, checks) returns:
 *   { pass: bool, score: number (0-100), checks: [{ label, pass }] }
 */

export class ScriptingEngine {
  /**
   * @param {string} code    - raw code string from the editor
   * @param {Array}  checks  - array of check objects for the lab
   * @returns {{ pass: bool, score: number, checks: Array }}
   */
  static validate(code, checks) {
    const normalized = code.replace(/\r\n/g, '\n').trim();

    const results = checks.map(check => {
      let pass = false;
      if (typeof check.test === 'function') {
        pass = check.test(normalized);
      } else if (check.test instanceof RegExp) {
        pass = check.test.test(normalized);
      }
      return { label: check.label, pass, required: check.required !== false };
    });

    const requiredChecks = results.filter(r => r.required);
    const passedRequired = requiredChecks.filter(r => r.pass).length;
    const score = requiredChecks.length > 0
      ? Math.round((passedRequired / requiredChecks.length) * 100)
      : 0;
    const pass = score >= 70 && passedRequired === requiredChecks.length;

    return { pass, score, checks: results };
  }

  /**
   * Detect language from code (python vs bash).
   * @param {string} code
   * @returns {'python'|'bash'|'unknown'}
   */
  static detectLanguage(code) {
    if (/^#!.*\bbash\b/m.test(code) || /^\s*for\s+\w+\s+in/m.test(code) && !/^from |^import /.test(code)) {
      return 'bash';
    }
    if (/^from |^import |def |print\(/.test(code)) return 'python';
    return 'unknown';
  }

  /**
   * Generate a starter template for a lab.
   * @param {'python'|'bash'} lang
   * @param {string} template
   * @returns {string}
   */
  static getTemplate(lang, template) {
    return template || (lang === 'bash' ? '#!/bin/bash\n\n# Your script here\n' : '# Your Python script here\n');
  }
}

// ─── Lab Check Libraries ───────────────────────────────────────────────────────

/** Python helpers */
export const py = {
  imports: (mod)  => new RegExp(`(?:from\\s+${mod}\\s+import|import\\s+${mod})`, 'm'),
  importFrom: (mod, name) => new RegExp(`from\\s+${mod}\\s+import[^\\n]*\\b${name}\\b`, 'm'),
  hasVar: (name)  => new RegExp(`\\b${name}\\s*=`, 'm'),
  dictKey: (key)  => new RegExp(`['"]${key}['"]\\s*:`, 'm'),
  methodCall: (m) => new RegExp(`\\.${m}\\s*\\(`, 'm'),
  funcCall: (f)   => new RegExp(`\\b${f}\\s*\\(`, 'm'),
  forLoop: ()     => /^\s*for\s+\w+\s+in\s+/m,
  tryExcept: ()   => /^\s*try\s*:/m,
  withOpen: ()    => /with\s+open\s*\(/m,
  fstring: ()     => /f['"][^'"]*{/,
  regex: ()       => /\bre\.(search|findall|match|finditer)\s*\(/,
};

/** Bash helpers */
export const sh = {
  shebang:   () => /^#!.*\/(bash|sh)\b/,
  array:     () => /\w+=\s*\(/,
  forLoop:   () => /^\s*for\s+\w+\s+in/m,
  ifCheck:   () => /\[\s*\$\?/,
  sshCmd:    () => /\bssh\b/,
  pingCmd:   () => /\bping\b.*-c\s*\d/,
  redirect:  () => />\s*\S+\.txt/,
  seqRange:  () => /\$\(seq\s+|{[0-9]+\.\.[0-9]+}/,
  dateCmd:   () => /\$\(date\b|\bDATE\s*=/,
  nullRedir: () => /\/dev\/null/,
};
