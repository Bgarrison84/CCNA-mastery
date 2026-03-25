/**
 * Terminal.js — Cisco IOS CLI Simulator
 *
 * Implements the State Pattern for context-aware prompts:
 *   Router>          (USER_EXEC)
 *   Router#          (PRIVILEGED_EXEC)
 *   Router(config)#  (GLOBAL_CONFIG)
 *   Router(config-if)#    (INTERFACE_CONFIG)
 *   Router(config-line)#  (LINE_CONFIG)
 *   Router(config-router)# (ROUTER_CONFIG)
 *
 * Core API:
 *   terminal.execute(input) → { output: string[], success: bool }
 *   terminal.validate(targetConfig) → { pass: bool, missing: [], extra: [] }
 *   terminal.reset()
 *   terminal.loadLab(labConfig)
 */
import { bus } from '../core/EventBus.js';

// ─── CLI Modes (State Pattern) ────────────────────────────────────────────────
const MODE = {
  USER_EXEC:        'USER_EXEC',
  PRIVILEGED_EXEC:  'PRIVILEGED_EXEC',
  GLOBAL_CONFIG:    'GLOBAL_CONFIG',
  INTERFACE_CONFIG: 'INTERFACE_CONFIG',
  LINE_CONFIG:      'LINE_CONFIG',
  ROUTER_CONFIG:    'ROUTER_CONFIG',
  ACL_CONFIG:       'ACL_CONFIG',
  DHCP_CONFIG:      'DHCP_CONFIG',
};

const PROMPT_FN = {
  [MODE.USER_EXEC]:        (h)      => `${h}>`,
  [MODE.PRIVILEGED_EXEC]:  (h)      => `${h}#`,
  [MODE.GLOBAL_CONFIG]:    (h)      => `${h}(config)#`,
  [MODE.INTERFACE_CONFIG]: (h)      => `${h}(config-if)#`,
  [MODE.LINE_CONFIG]:      (h)      => `${h}(config-line)#`,
  [MODE.ROUTER_CONFIG]:    (h)      => `${h}(config-router)#`,
  [MODE.ACL_CONFIG]:       (h, ctx) => `${h}(config-${ctx.aclType === 'standard' ? 'std' : 'ext'}-nacl)#`,
  [MODE.DHCP_CONFIG]:      (h, ctx) => `${h}(dhcp-config)#`,
};

// ─── Running Config Data Model ────────────────────────────────────────────────
function makeBlankConfig(hostname = 'Router') {
  return {
    hostname,
    enableSecret: null,
    banner: null,
    interfaces: {},   // { 'GigabitEthernet0/0': { ip, mask, shutdown, description } }
    routing: {
      rip: null,      // { version: 2, networks: [] }
      ospf: {},       // { processId: { routerId, networks: [] } }
      static: [],     // [{ network, mask, nextHop }]
    },
    lines: {
      console: { password: null, login: false },
      vty: { password: null, login: false, transport: 'telnet' },
    },
    acls: {},         // { aclName: ['permit ip ...', 'deny ip ...'] }
    namedAcls: {},    // { aclName: 'standard'|'extended' } — tracks which ACLs are named
    vlans: {},        // { id: { name } }
    dhcp: {},         // { poolName: { network, mask, defaultRouter, dns } }
    dhcpExcluded: [], // [{ start, end }]
    ipRouting: false,   // Layer 3 switch: ip routing
    ipv6Routing: false,
    spanning_tree: { mode: 'pvst', vlanPriority: {} }, // vlanPriority: { vlanId: priority }
    nat: { insideSources: [], pools: {} }, // insideSources: [{type,aclNum,interface|poolName|insideIp+outsideIp}]
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalizeInterface(name) {
  const aliases = {
    'g': 'GigabitEthernet', 'gi': 'GigabitEthernet', 'gig': 'GigabitEthernet',
    'gigabitethernet': 'GigabitEthernet',
    'f': 'FastEthernet', 'fa': 'FastEthernet', 'fastethernet': 'FastEthernet',
    's': 'Serial', 'se': 'Serial', 'serial': 'Serial',
    'lo': 'Loopback', 'loopback': 'Loopback',
    'e': 'Ethernet', 'ethernet': 'Ethernet',
    'po': 'Port-channel', 'port-channel': 'Port-channel', 'portchannel': 'Port-channel',
    'vlan': 'Vlan',
  };
  const m = name.match(/^([a-zA-Z]+)(\d[\d/.]*)$/);
  if (!m) return name;
  const prefix = (aliases[m[1].toLowerCase()] || m[1]);
  return `${prefix}${m[2]}`;
}

// ─── Terminal Class ───────────────────────────────────────────────────────────
export class Terminal {
  /**
   * @param {object} opts
   * @param {string} opts.hostname
   * @param {HTMLElement} opts.outputEl  - where to render output lines
   * @param {HTMLElement} opts.inputEl   - the <input> element
   * @param {HTMLElement} opts.promptEl  - the prompt label element
   * @param {object}  opts.store         - Store instance
   */
  constructor({ hostname = 'Router', outputEl, inputEl, promptEl, store } = {}) {
    this.hostname    = hostname;
    this.outputEl    = outputEl;
    this.inputEl     = inputEl;
    this.promptEl    = promptEl;
    this.store       = store;

    this._mode       = MODE.USER_EXEC;
    this._context    = {};           // { interface, lineType, routerProcess, aclName, aclType }
    this._config     = makeBlankConfig(hostname);
    this._history    = [];
    this._historyIdx = -1;
    this._labTarget  = null;         // targetConfig for validate()
    this._labId      = null;
    this._devices    = null;         // multi-device map: { R1: config, R2: config }
    this._activeDevice = null;

    this._bindKeys();
    this._refreshPrompt();
    this._print('Welcome to Cisco IOS (Simulated). Type ? for help.', 'text-gray-400');
    this._print('');
  }

  // ─── Lab Loading ─────────────────────────────────────────────────────────

  /** Load a lab: sets hostname, expected target config, and prints objective. */
  loadLab(labConfig) {
    this._labId     = labConfig.id;
    this._labTarget = labConfig.targetConfig || null;
    this._mode      = MODE.USER_EXEC;
    this._context   = {};

    // Multi-device support: labConfig.devices = { R1: targetConfig, R2: targetConfig }
    if (labConfig.devices && typeof labConfig.devices === 'object') {
      this._devices = {};
      for (const [devName, devTarget] of Object.entries(labConfig.devices)) {
        this._devices[devName] = makeBlankConfig(devTarget.hostname || devName);
      }
      this._activeDevice = Object.keys(this._devices)[0];
      this._config       = this._devices[this._activeDevice];
      this.hostname      = this._config.hostname;
      this._labTarget    = labConfig.devices; // used by validate()
    } else {
      this._devices      = null;
      this._activeDevice = null;
      this.hostname      = labConfig.hostname || 'Router';
      this._config       = makeBlankConfig(this.hostname);
    }

    this._clearOutput();
    this._refreshPrompt();

    this._print('═══════════════════════════════════════════', 'text-yellow-400');
    this._print(` LAB: ${labConfig.title}`, 'text-yellow-300 font-bold');
    this._print('───────────────────────────────────────────', 'text-yellow-400');
    labConfig.objectives?.forEach((obj, i) =>
      this._print(` ${i + 1}. ${obj}`, 'text-green-300'));
    this._print('═══════════════════════════════════════════', 'text-yellow-400');
    this._print('');
  }

  /**
   * Switch the active device in a multi-device lab.
   * Returns false if not a multi-device lab or device name unknown.
   */
  switchDevice(name) {
    if (!this._devices || !this._devices[name]) return false;
    this._activeDevice = name;
    this._config       = this._devices[name];
    this.hostname      = this._config.hostname;
    this._mode         = MODE.USER_EXEC;
    this._context      = {};
    this._refreshPrompt();
    this._print(`[Switched to ${name}]`, 'text-cyan-400');
    return true;
  }

  /** Returns array of device names for multi-device labs, else null. */
  get deviceNames() {
    return this._devices ? Object.keys(this._devices) : null;
  }

  get activeDevice() {
    return this._activeDevice;
  }

  // ─── Main Entry Point ─────────────────────────────────────────────────────

  execute(rawInput) {
    const input = rawInput.trim();
    if (!input) return;

    this._history.unshift(input);
    this._historyIdx = -1;
    this._echoInput(input);

    const tokens = input.toLowerCase().split(/\s+/);
    const cmd    = tokens[0];
    const args   = tokens.slice(1);
    const rawArgs = rawInput.trim().split(/\s+/).slice(1);

    try {
      const result = this._dispatch(cmd, args, rawArgs, input);
      if (result) {
        if (result.lines) result.lines.forEach(l => this._print(l.text, l.cls));
        if (result.modeChange) this._refreshPrompt();
      }
    } catch (e) {
      this._print(`% Error: ${e.message}`, 'text-red-400');
    }
  }

  // ─── Command Dispatcher ───────────────────────────────────────────────────

  _dispatch(cmd, args, rawArgs, full) {
    const mode = this._mode;

    // ── Universal commands ──────────────────────────────────────────────────
    if (cmd === '?' || cmd === 'help') return this._cmdHelp();
    if (cmd === 'exit' || cmd === 'end') return this._cmdExit(cmd);
    if (cmd === 'do') return this._cmdDo(args, rawArgs);

    // ── User EXEC ───────────────────────────────────────────────────────────
    if (mode === MODE.USER_EXEC) {
      if (cmd === 'enable') return this._cmdEnable(args);
      if (this._isAbbrev(cmd, 'show')) return this._cmdShow(args);
      return this._unknownOrPriv(cmd);
    }

    // ── Privileged EXEC ─────────────────────────────────────────────────────
    if (mode === MODE.PRIVILEGED_EXEC) {
      if (cmd === 'disable') return this._setMode(MODE.USER_EXEC);
      if (this._isAbbrev(cmd, 'configure')) return this._cmdConfigure(args);
      if (this._isAbbrev(cmd, 'show'))      return this._cmdShow(args);
      if (this._isAbbrev(cmd, 'copy'))      return this._cmdCopy(args);
      if (this._isAbbrev(cmd, 'reload'))    return this._cmdReload();
      if (this._isAbbrev(cmd, 'write'))     return this._cmdWrite(args);
      if (this._isAbbrev(cmd, 'erase'))     return this._cmdErase(args);
      if (this._isAbbrev(cmd, 'debug'))     return this._cmdDebug(args);
      if (this._isAbbrev(cmd, 'ping'))      return this._cmdPing(rawArgs);
      if (this._isAbbrev(cmd, 'traceroute'))return this._cmdTraceroute(rawArgs);
      return this._unknownCmd(cmd);
    }

    // ── Global Config ───────────────────────────────────────────────────────
    if (mode === MODE.GLOBAL_CONFIG) {
      if (this._isAbbrev(cmd, 'hostname'))       return this._cmdHostname(rawArgs);
      if (this._isAbbrev(cmd, 'interface'))      return this._cmdInterface(rawArgs);
      if (this._isAbbrev(cmd, 'ip'))             return this._cmdGlobalIp(args, rawArgs);
      if (this._isAbbrev(cmd, 'router'))         return this._cmdRouter(args);
      if (this._isAbbrev(cmd, 'line'))           return this._cmdLine(args);
      if (this._isAbbrev(cmd, 'banner'))         return this._cmdBanner(rawArgs, full);
      if (this._isAbbrev(cmd, 'enable'))         return this._cmdEnableSecret(args, rawArgs);
      if (this._isAbbrev(cmd, 'no'))             return this._cmdNo(args, rawArgs, mode);
      if (this._isAbbrev(cmd, 'access-list'))    return this._cmdAccessList(args, rawArgs);
      if (this._isAbbrev(cmd, 'vlan'))           return this._cmdVlan(args);
      if (this._isAbbrev(cmd, 'spanning-tree'))  return this._cmdSpanningTree(args);
      if (this._isAbbrev(cmd, 'ipv6'))           return this._cmdGlobalIpv6(args, rawArgs);
      if (this._isAbbrev(cmd, 'service'))        return { lines: [] }; // accept silently
      if (this._isAbbrev(cmd, 'logging'))        return { lines: [] };
      return this._unknownCmd(cmd);
    }

    // ── Interface Config ────────────────────────────────────────────────────
    if (mode === MODE.INTERFACE_CONFIG) {
      if (this._isAbbrev(cmd, 'ip'))          return this._cmdIfIp(args, rawArgs);
      if (this._isAbbrev(cmd, 'description')) return this._cmdIfDescription(rawArgs);
      if (this._isAbbrev(cmd, 'shutdown'))    return this._cmdShutdown(false);
      if (cmd === 'no')                       return this._cmdNo(args, rawArgs, mode);
      if (this._isAbbrev(cmd, 'duplex'))      return this._cmdDuplex(args);
      if (this._isAbbrev(cmd, 'speed'))       return this._cmdSpeed(args);
      if (this._isAbbrev(cmd, 'encapsulation')) return this._cmdEncap(args);
      if (this._isAbbrev(cmd, 'switchport'))    return this._cmdSwitchport(args);
      if (this._isAbbrev(cmd, 'ipv6'))          return this._cmdIfIpv6(args, rawArgs);
      if (this._isAbbrev(cmd, 'standby'))       return this._cmdStandby(args, rawArgs);
      if (this._isAbbrev(cmd, 'channel-group')) return this._cmdChannelGroup(args);
      if (this._isAbbrev(cmd, 'spanning-tree')) return this._cmdIfSpanningTree(args);
      return this._unknownCmd(cmd);
    }

    // ── Line Config ─────────────────────────────────────────────────────────
    if (mode === MODE.LINE_CONFIG) {
      if (this._isAbbrev(cmd, 'password'))  return this._cmdLinePassword(rawArgs);
      if (this._isAbbrev(cmd, 'login'))     return this._cmdLineLogin(args);
      if (this._isAbbrev(cmd, 'transport')) return this._cmdTransport(args);
      if (this._isAbbrev(cmd, 'exec-timeout')) return { lines: [] };
      if (cmd === 'no')                     return this._cmdNo(args, rawArgs, mode);
      return this._unknownCmd(cmd);
    }

    // ── Router Config ───────────────────────────────────────────────────────
    if (mode === MODE.ROUTER_CONFIG) {
      if (this._isAbbrev(cmd, 'network'))  return this._cmdRoutingNetwork(args);
      if (this._isAbbrev(cmd, 'version'))  return this._cmdRipVersion(args);
      if (this._isAbbrev(cmd, 'router-id'))return this._cmdRouterId(args);
      if (cmd === 'no')                    return this._cmdNo(args, rawArgs, mode);
      return this._unknownCmd(cmd);
    }

    // ── Named ACL Config ────────────────────────────────────────────────────
    if (mode === MODE.ACL_CONFIG) {
      if (this._isAbbrev(cmd, 'permit')) return this._cmdAclEntry('permit', args, rawArgs);
      if (this._isAbbrev(cmd, 'deny'))   return this._cmdAclEntry('deny',   args, rawArgs);
      if (cmd === 'remark') return { lines: [] }; // accepted silently
      if (cmd === 'no')     return this._cmdAclEntryNo(args, rawArgs);
      return this._unknownCmd(cmd);
    }

    // ── DHCP Pool Config ────────────────────────────────────────────────────
    if (mode === MODE.DHCP_CONFIG) {
      if (this._isAbbrev(cmd, 'network'))        return this._cmdDhcpNetwork(rawArgs);
      if (this._isAbbrev(cmd, 'default-router')) return this._cmdDhcpDefaultRouter(rawArgs);
      if (this._isAbbrev(cmd, 'dns-server'))     return this._cmdDhcpDns(rawArgs);
      if (this._isAbbrev(cmd, 'lease'))          return { lines: [] }; // silently accepted
      return this._unknownCmd(cmd);
    }

    return this._unknownCmd(cmd);
  }

  // ─── Commands ─────────────────────────────────────────────────────────────

  _cmdEnable(args) {
    if (this._config.enableSecret && args[0] !== this._config.enableSecret) {
      if (args[0] !== undefined) return this._err('% Error in authentication.');
    }
    return this._setMode(MODE.PRIVILEGED_EXEC, { prompt: 'Password:' });
  }

  _cmdConfigure(args) {
    const target = args[0] || 'terminal';
    if (!this._isAbbrev(target, 'terminal')) {
      return this._err('% Use: configure terminal');
    }
    this._print('Enter configuration commands, one per line. End with CNTL/Z.');
    return this._setMode(MODE.GLOBAL_CONFIG);
  }

  _cmdHostname(rawArgs) {
    const name = rawArgs[0];
    if (!name) return this._err('% Incomplete command.');
    this.hostname = name;
    this._config.hostname = name;
    return { lines: [], modeChange: true };
  }

  _cmdInterface(rawArgs) {
    // Handle two-token forms: "interface vlan 10" or "interface port-channel 1"
    let raw = rawArgs[0] || '';
    if (rawArgs[1] && /^\d+$/.test(rawArgs[1]) && !/\d/.test(raw)) {
      raw = raw + rawArgs[1];
    }
    const ifName = normalizeInterface(raw);
    if (!ifName || !/\d/.test(ifName)) return this._err('% Incomplete command.');
    const isVlan = ifName.startsWith('Vlan');
    if (!this._config.interfaces[ifName]) {
      // SVIs default to shutdown=false (they come up when vlan exists and ip address is set)
      this._config.interfaces[ifName] = { ip: null, mask: null, shutdown: isVlan ? false : true, description: '' };
    }
    this._context.interface = ifName;
    return this._setMode(MODE.INTERFACE_CONFIG);
  }

  _cmdIfIp(args, rawArgs) {
    if (args[0] === 'address') {
      const ip   = rawArgs[1];
      const mask = rawArgs[2];
      if (!ip || !mask) return this._err('% Incomplete command.');
      const iface = this._config.interfaces[this._context.interface];
      iface.ip   = ip;
      iface.mask = mask;
      return { lines: [] };
    }
    if (args[0] === 'access-group') {
      const aclName  = rawArgs[1];
      const dir      = rawArgs[2];
      const iface = this._config.interfaces[this._context.interface];
      iface.acl = { name: aclName, direction: dir };
      return { lines: [] };
    }
    if (args[0] === 'nat') {
      const dir = args[1]; // 'inside' or 'outside'
      if (dir !== 'inside' && dir !== 'outside') return this._err('% ip nat: specify inside or outside');
      const iface = this._config.interfaces[this._context.interface];
      if (dir === 'inside')  iface.natInside  = true;
      if (dir === 'outside') iface.natOutside = true;
      return { lines: [] };
    }
    return this._err('% Unknown ip subcommand.');
  }

  _cmdIfDescription(rawArgs) {
    const desc = rawArgs.join(' ');
    this._config.interfaces[this._context.interface].description = desc;
    return { lines: [] };
  }

  _cmdShutdown(state = true) {
    this._config.interfaces[this._context.interface].shutdown = state;
    if (!state) this._print('%LINK-5-CHANGED: Interface changed state to up', 'text-green-400');
    return { lines: [] };
  }

  _cmdDuplex(args) {
    this._config.interfaces[this._context.interface].duplex = args[0];
    return { lines: [] };
  }

  _cmdSpeed(args) {
    this._config.interfaces[this._context.interface].speed = args[0];
    return { lines: [] };
  }

  _cmdEncap(args) {
    this._config.interfaces[this._context.interface].encapsulation = args[0];
    return { lines: [] };
  }

  _cmdSwitchport(args) {
    const iface = this._config.interfaces[this._context.interface];
    if (!iface.switchport) iface.switchport = {};

    if (args[0] === 'mode')   iface.switchport.mode = args[1];
    if (args[0] === 'access' && args[1] === 'vlan') iface.switchport.accessVlan = args[2];
    if (args[0] === 'trunk'  && args[1] === 'encapsulation') iface.switchport.trunkEncap = args[2];

    // Port security
    if (args[0] === 'port-security') {
      if (!iface.portSecurity) iface.portSecurity = {};
      if (!args[1]) {
        // bare: switchport port-security  → enable
        iface.portSecurity.enabled = true;
      } else if (args[1] === 'maximum') {
        iface.portSecurity.enabled = true;
        iface.portSecurity.maximum = parseInt(args[2]) || 1;
      } else if (args[1] === 'mac-address') {
        iface.portSecurity.enabled = true;
        if (args[2] === 'sticky') {
          iface.portSecurity.sticky = true;
        } else {
          if (!iface.portSecurity.macAddresses) iface.portSecurity.macAddresses = [];
          if (args[2]) iface.portSecurity.macAddresses.push(args[2]);
        }
      } else if (args[1] === 'violation') {
        iface.portSecurity.enabled = true;
        iface.portSecurity.violation = args[2]; // protect|restrict|shutdown
      }
    }

    return { lines: [] };
  }

  _cmdGlobalIp(args, rawArgs) {
    if (args[0] === 'routing') {
      this._config.ipRouting = true;
      return { lines: [] };
    }
    if (args[0] === 'route') {
      // ip route <network> <mask> <next-hop>
      const [,, network, mask, nextHop] = rawArgs;
      if (!network || !mask || !nextHop) return this._err('% Incomplete command.');
      this._config.routing.static.push({ network, mask, nextHop });
      return { lines: [] };
    }
    if (args[0] === 'dhcp') {
      if (args[1] === 'pool') {
        const poolName = rawArgs[2];
        if (!poolName) return this._err('% Incomplete command.');
        if (!this._config.dhcp[poolName]) this._config.dhcp[poolName] = {};
        this._context.dhcpPool = poolName;
        return this._setMode(MODE.DHCP_CONFIG);
      }
      if (args[1] === 'excluded-address') {
        const start = rawArgs[2], end = rawArgs[3];
        if (!start) return this._err('% Incomplete command.');
        if (!this._config.dhcpExcluded) this._config.dhcpExcluded = [];
        this._config.dhcpExcluded.push({ start, end: end || start });
        return { lines: [] };
      }
    }
    if (args[0] === 'access-list') {
      // ip access-list {standard|extended} NAME
      const aclType = args[1]; // 'standard' or 'extended'
      const aclName = rawArgs[2];
      if (!aclType || !aclName) return this._err('% Incomplete command.');
      if (aclType !== 'standard' && aclType !== 'extended')
        return this._err('% ip access-list: specify standard or extended');
      return this._cmdNamedAcl(aclName, aclType);
    }
    if (args[0] === 'nat') {
      if (args[1] === 'pool') {
        // ip nat pool POOLNAME STARTIP ENDIP netmask MASK
        const poolName = rawArgs[2], start = rawArgs[3], end = rawArgs[4];
        const netmask  = rawArgs[6]; // rawArgs[5] = 'netmask'
        if (!poolName || !start || !end) return this._err('% Incomplete command.');
        this._config.nat.pools[poolName] = { start, end, netmask: netmask || '255.255.255.0' };
        return { lines: [] };
      }
      if (args[1] === 'inside' && args[2] === 'source') {
        // ip nat inside source list ACLNUM interface IFNAME overload  (PAT)
        // ip nat inside source list ACLNUM pool POOLNAME [overload]   (dynamic)
        // ip nat inside source static INSIDE OUTSIDE                  (static)
        if (args[3] === 'static') {
          const insideIp = rawArgs[4], outsideIp = rawArgs[5];
          if (!insideIp || !outsideIp) return this._err('% Incomplete command.');
          this._config.nat.insideSources.push({ type: 'static', insideIp, outsideIp });
        } else if (args[3] === 'list') {
          const aclNum = rawArgs[4];
          if (!aclNum) return this._err('% Incomplete command.');
          if (args[5] === 'interface') {
            const ifName = normalizeInterface(rawArgs[6]);
            this._config.nat.insideSources.push({ type: 'overload', aclNum, interface: ifName });
          } else if (args[5] === 'pool') {
            const poolName = rawArgs[6];
            const overload = args[7] === 'overload';
            this._config.nat.insideSources.push({ type: 'pool', aclNum, poolName, overload });
          } else {
            return this._err('% ip nat inside source list: specify interface or pool');
          }
        } else {
          return this._err('% ip nat inside source: specify list or static');
        }
        return { lines: [] };
      }
      return this._err('% Unknown ip nat command.');
    }
    return this._err('% Unknown ip command.');
  }

  _cmdRouter(args) {
    const proto = args[0];
    if (proto === 'rip') {
      if (!this._config.routing.rip) this._config.routing.rip = { version: 1, networks: [] };
      this._context.routerProto = 'rip';
    } else if (proto === 'ospf') {
      const pid = args[1] || '1';
      if (!this._config.routing.ospf[pid]) this._config.routing.ospf[pid] = { networks: [] };
      this._context.routerProto = 'ospf';
      this._context.routerPid   = pid;
    } else {
      return this._err(`% Unknown routing protocol: ${proto}`);
    }
    return this._setMode(MODE.ROUTER_CONFIG);
  }

  _cmdRoutingNetwork(args) {
    const net = args[0];
    if (!net) return this._err('% Incomplete command.');
    if (this._context.routerProto === 'rip') {
      this._config.routing.rip.networks.push(net);
    } else if (this._context.routerProto === 'ospf') {
      const wildcard = args[1], area = args[3];
      this._config.routing.ospf[this._context.routerPid].networks.push({ net, wildcard, area });
    }
    return { lines: [] };
  }

  _cmdRipVersion(args) {
    if (this._config.routing.rip) this._config.routing.rip.version = parseInt(args[0]);
    return { lines: [] };
  }

  _cmdRouterId(args) {
    if (this._context.routerProto === 'ospf') {
      this._config.routing.ospf[this._context.routerPid].routerId = args[0];
    }
    return { lines: [] };
  }

  _cmdLine(args) {
    const type = args[0];
    if (type === 'console') {
      this._context.lineType = 'console';
    } else if (type === 'vty') {
      this._context.lineType = 'vty';
    } else {
      return this._err(`% Unknown line type: ${type}`);
    }
    return this._setMode(MODE.LINE_CONFIG);
  }

  _cmdLinePassword(rawArgs) {
    const pwd = rawArgs[0];
    if (!pwd) return this._err('% Incomplete command.');
    this._config.lines[this._context.lineType].password = pwd;
    return { lines: [] };
  }

  _cmdLineLogin(args) {
    this._config.lines[this._context.lineType].login = true;
    return { lines: [] };
  }

  _cmdTransport(args) {
    if (args[0] === 'input') this._config.lines.vty.transport = args[1];
    return { lines: [] };
  }

  _cmdBanner(rawArgs, full) {
    // banner motd # message #
    const delim = rawArgs[1];
    if (!delim) return this._err('% Incomplete command.');
    const start = full.indexOf(delim) + 1;
    const end   = full.indexOf(delim, start);
    this._config.banner = end > start ? full.substring(start, end).trim() : rawArgs.slice(2).join(' ');
    return { lines: [] };
  }

  _cmdEnableSecret(args, rawArgs) {
    if (args[0] === 'secret') {
      this._config.enableSecret = rawArgs[1];
      return { lines: [] };
    }
    if (args[0] === 'password') {
      this._config.enablePassword = rawArgs[1];
      return { lines: [] };
    }
    return this._err('% Incomplete command.');
  }

  _cmdAccessList(args, rawArgs) {
    const name = rawArgs[0];
    if (!this._config.acls[name]) this._config.acls[name] = [];
    this._config.acls[name].push(rawArgs.slice(1).join(' '));
    return { lines: [] };
  }

  _cmdNamedAcl(name, type) {
    if (!this._config.acls[name]) this._config.acls[name] = [];
    this._config.namedAcls[name] = type;
    this._context.aclName = name;
    this._context.aclType = type;
    return this._setMode(MODE.ACL_CONFIG);
  }

  _cmdAclEntry(action, args, rawArgs) {
    // Reconstruct the full entry: e.g. "permit ip 192.168.1.0 0.0.0.255 any"
    // rawArgs[0] is the keyword (permit|deny), rest is the predicate
    const entry = action + ' ' + rawArgs.slice(1).join(' ');
    const name  = this._context.aclName;
    if (!this._config.acls[name]) this._config.acls[name] = [];
    this._config.acls[name].push(entry);
    return { lines: [] };
  }

  _cmdAclEntryNo(args, rawArgs) {
    // no <seq>   or   no permit/deny ...
    const name    = this._context.aclName;
    const entries = this._config.acls[name];
    if (!entries) return { lines: [] };
    const target = rawArgs.slice(1).join(' ').toLowerCase();
    const idx    = entries.findIndex(e => e.toLowerCase().includes(target));
    if (idx !== -1) entries.splice(idx, 1);
    return { lines: [] };
  }

  _cmdVlan(args) {
    const id = args[0];
    if (!id) return this._err('% Incomplete command.');
    if (!this._config.vlans[id]) this._config.vlans[id] = { name: `VLAN${id}` };
    return { lines: [] };
  }

  _cmdSpanningTree(args) {
    if (args[0] === 'mode') this._config.spanning_tree.mode = args[1];
    if (args[0] === 'vlan' && args[2] === 'priority') {
      if (!this._config.spanning_tree.vlanPriority) this._config.spanning_tree.vlanPriority = {};
      this._config.spanning_tree.vlanPriority[args[1]] = parseInt(args[3]);
    }
    return { lines: [] };
  }

  _cmdIfSpanningTree(args) {
    const iface = this._config.interfaces[this._context.interface];
    if (args[0] === 'portfast') iface.spanningTreePortfast = true;
    return { lines: [] };
  }

  // ── IPv6 global commands ──────────────────────────────────────────────────
  _cmdGlobalIpv6(args, rawArgs) {
    if (args[0] === 'unicast-routing') {
      this._config.ipv6Routing = true;
      return { lines: [] };
    }
    if (args[0] === 'route') {
      // ipv6 route PREFIX/LEN NEXT-HOP
      const prefix = rawArgs[1], nextHop = rawArgs[2];
      if (!prefix || !nextHop) return this._err('% Incomplete command.');
      if (!this._config.routing.ipv6Static) this._config.routing.ipv6Static = [];
      this._config.routing.ipv6Static.push({ prefix, nextHop });
      return { lines: [] };
    }
    return this._err('% Unknown ipv6 command.');
  }

  // ── IPv6 interface command ─────────────────────────────────────────────────
  _cmdIfIpv6(args, rawArgs) {
    const iface = this._config.interfaces[this._context.interface];
    if (args[0] === 'address') {
      const addr = rawArgs[1];
      if (!addr) return this._err('% Incomplete command.');
      if (!iface.ipv6) iface.ipv6 = [];
      iface.ipv6.push(addr);
      return { lines: [] };
    }
    if (args[0] === 'enable') return { lines: [] };
    return this._err('% Unknown ipv6 interface subcommand.');
  }

  // ── HSRP (standby) ────────────────────────────────────────────────────────
  _cmdStandby(args, rawArgs) {
    const iface = this._config.interfaces[this._context.interface];
    if (!iface.hsrp) iface.hsrp = {};
    // standby [group] ip|priority|preempt
    // args[0] could be a group number or a keyword
    let groupId = '0', subCmd, rest;
    if (!isNaN(args[0])) {
      groupId = args[0]; subCmd = args[1]; rest = rawArgs.slice(2);
    } else {
      subCmd = args[0]; rest = rawArgs.slice(1);
    }
    if (!iface.hsrp[groupId]) iface.hsrp[groupId] = {};
    if (subCmd === 'ip')       iface.hsrp[groupId].ip       = rest[0];
    if (subCmd === 'priority') iface.hsrp[groupId].priority = parseInt(rest[0]);
    if (subCmd === 'preempt')  iface.hsrp[groupId].preempt  = true;
    return { lines: [] };
  }

  // ── EtherChannel ─────────────────────────────────────────────────────────
  _cmdChannelGroup(args) {
    // channel-group N mode {active|passive|on|desirable|auto}
    const id = args[0], mode = args[2];
    if (!id) return this._err('% Incomplete command.');
    const iface = this._config.interfaces[this._context.interface];
    iface.channelGroup = { id, mode: mode || 'on' };
    // Auto-create the port-channel interface if not present
    const poName = `Port-channel${id}`;
    if (!this._config.interfaces[poName]) {
      this._config.interfaces[poName] = { ip: null, mask: null, shutdown: false, description: '' };
    }
    return { lines: [] };
  }

  // ── DHCP pool subcommands ─────────────────────────────────────────────────
  _cmdDhcpNetwork(rawArgs) {
    const pool = this._context.dhcpPool;
    if (!pool) return this._err('% Not in DHCP pool context.');
    this._config.dhcp[pool].network = rawArgs[0];
    this._config.dhcp[pool].mask    = rawArgs[1];
    return { lines: [] };
  }

  _cmdDhcpDefaultRouter(rawArgs) {
    const pool = this._context.dhcpPool;
    if (!pool) return this._err('% Not in DHCP pool context.');
    this._config.dhcp[pool].defaultRouter = rawArgs[0];
    return { lines: [] };
  }

  _cmdDhcpDns(rawArgs) {
    const pool = this._context.dhcpPool;
    if (!pool) return this._err('% Not in DHCP pool context.');
    this._config.dhcp[pool].dns = rawArgs[0];
    return { lines: [] };
  }

  _cmdNo(args, rawArgs, mode) {
    const sub = args[0];
    if (mode === MODE.INTERFACE_CONFIG) {
      if (sub === 'shutdown') return this._cmdShutdown(false);
      if (sub === 'ip' && args[1] === 'address') {
        const iface = this._config.interfaces[this._context.interface];
        iface.ip = null; iface.mask = null;
        return { lines: [] };
      }
    }
    if (mode === MODE.GLOBAL_CONFIG) {
      if (sub === 'ip' && args[1] === 'route') {
        const network = rawArgs[2];
        this._config.routing.static = this._config.routing.static.filter(r => r.network !== network);
        return { lines: [] };
      }
    }
    return { lines: [{ text: '% Command removed (simulated).', cls: 'text-gray-400' }] };
  }

  _cmdDo(args, rawArgs) {
    // allow exec commands from config mode
    const cmd = args[0];
    const rest = args.slice(1);
    const savedMode = this._mode;
    this._mode = MODE.PRIVILEGED_EXEC;
    const result = this._dispatch(cmd, rest, rawArgs.slice(1), rawArgs.join(' '));
    this._mode = savedMode;
    return result;
  }

  _cmdShow(args) {
    const sub = args[0];
    const lines = [];

    if (sub === 'version' || this._isAbbrev(sub, 'version')) {
      lines.push({ text: 'Cisco IOS Software (Simulated), Version 15.2(4)S5', cls: 'text-green-300' });
      lines.push({ text: 'Copyright (c) CCNA Mastery Lab — Educational Simulator', cls: 'text-gray-400' });
      return { lines };
    }

    if (this._isAbbrev(sub, 'running-config')) {
      return { lines: this._renderRunningConfig() };
    }

    if (this._isAbbrev(sub, 'startup-config')) {
      lines.push({ text: '% Startup config not set (use: write memory)', cls: 'text-yellow-400' });
      return { lines };
    }

    if (this._isAbbrev(sub, 'interfaces')) {
      const ifFilter = args[1] ? normalizeInterface(args[1]) : null;
      return { lines: this._renderInterfaces(ifFilter) };
    }

    if (sub === 'ip') {
      if (args[1] === 'route') return { lines: this._renderRoutes() };
      if (args[1] === 'interface') return { lines: this._renderIpInterfaces() };
    }

    if (this._isAbbrev(sub, 'vlan')) {
      return { lines: this._renderVlans() };
    }

    if (sub === 'access-lists' || sub === 'access-list') {
      return { lines: this._renderAccessLists() };
    }

    lines.push({ text: `% Unknown show command: show ${args.join(' ')}`, cls: 'text-red-400' });
    return { lines };
  }

  _cmdCopy(args) {
    if (args[0] === 'running-config' && args[1] === 'startup-config') {
      this._print('Destination filename [startup-config]? ');
      this._print('Building configuration...', 'text-yellow-300');
      this._print('[OK]', 'text-green-400');
    }
    return { lines: [] };
  }

  _cmdWrite(args) {
    if (!args[0] || this._isAbbrev(args[0], 'memory')) {
      this._print('Building configuration...', 'text-yellow-300');
      this._print('[OK]', 'text-green-400');
    }
    return { lines: [] };
  }

  _cmdErase(args) {
    if (args[0] === 'startup-config' || this._isAbbrev(args[0], 'nvram')) {
      this._print('Erasing the nvram filesystem will remove all configuration files! Continue? [confirm]');
    }
    return { lines: [] };
  }

  _cmdReload() {
    this._print('Proceed with reload? [confirm]', 'text-yellow-300');
    this._print('Simulated reload — config preserved in this session.', 'text-gray-400');
    return { lines: [] };
  }

  _cmdDebug(args) {
    if (!this.store?.hasItem('debug_badge')) {
      return this._err('% Debug Badge required (unlock at Level 8).');
    }
    this._print(`Debug output for: ${args.join(' ')} [simulated]`, 'text-yellow-300');
    return { lines: [] };
  }

  _cmdPing(rawArgs) {
    const target = rawArgs[0];
    if (!target) return this._err('% Incomplete command.');
    this._print(`Sending 5, 100-byte ICMP Echos to ${target}, timeout is 2 seconds:`, 'text-green-300');
    this._print('!!!!!', 'text-green-400');
    this._print('Success rate is 100 percent (5/5), round-trip min/avg/max = 1/2/4 ms', 'text-green-300');
    return { lines: [] };
  }

  _cmdTraceroute(rawArgs) {
    const target = rawArgs[0];
    if (!target) return this._err('% Incomplete command.');
    this._print(`Tracing the route to ${target}`, 'text-green-300');
    this._print('  1  192.168.1.1  1 msec  1 msec  2 msec', 'text-green-300');
    this._print(`  2  ${target}  2 msec  2 msec  3 msec`, 'text-green-300');
    return { lines: [] };
  }

  _cmdHelp() {
    const modeHelp = {
      [MODE.USER_EXEC]: [
        'enable                - Enter Privileged EXEC mode',
        'show [version|...]    - Display system information',
        'exit                  - Exit',
      ],
      [MODE.PRIVILEGED_EXEC]: [
        'configure terminal    - Enter Global Configuration mode',
        'show running-config   - Display current config',
        'show ip route         - Display routing table',
        'show interfaces       - Display interface status',
        'copy run start        - Save configuration',
        'ping <ip>             - Test connectivity',
        'write memory          - Save config',
        'reload                - Reload device',
        'disable               - Return to User EXEC',
      ],
      [MODE.GLOBAL_CONFIG]: [
        'hostname <name>       - Set device hostname',
        'interface <type><n>   - Enter interface config',
        'ip route <n> <m> <nh> - Add static route',
        'router rip|ospf       - Enter routing config',
        'line console 0        - Configure console',
        'line vty 0 4          - Configure VTY lines',
        'enable secret <pwd>   - Set enable password',
        'banner motd # msg #   - Set MOTD banner',
        'access-list ...       - Define numbered ACL',
        'ip access-list ext NAME - Enter named ACL config mode',
        'vlan <id>             - Create VLAN',
        'no <cmd>              - Negate / remove command',
        'end / exit            - Exit config mode',
      ],
      [MODE.INTERFACE_CONFIG]: [
        'ip address <ip> <mask>  - Assign IP address',
        'description <text>      - Set description',
        'no shutdown             - Enable interface',
        'shutdown                - Disable interface',
        'duplex [auto|full|half] - Set duplex',
        'speed [10|100|1000]     - Set speed',
        'switchport port-security          - Enable port security',
        'switchport port-security maximum N - Set max MACs',
        'switchport port-security mac-address sticky',
        'switchport port-security violation {protect|restrict|shutdown}',
        'exit / end              - Return to Global Config',
      ],
      [MODE.ACL_CONFIG]: [
        'permit <protocol> <src> <dst>  - Add permit entry',
        'deny   <protocol> <src> <dst>  - Add deny entry',
        'remark <text>                  - Add comment',
        'no <entry>                     - Remove entry',
        'exit                           - Return to Global Config',
      ],
    };
    const lines = (modeHelp[this._mode] || []).map(l => ({ text: l, cls: 'text-cyan-300' }));
    return { lines };
  }

  _cmdExit(cmd) {
    const transitions = {
      [MODE.PRIVILEGED_EXEC]:  MODE.USER_EXEC,
      [MODE.GLOBAL_CONFIG]:    MODE.PRIVILEGED_EXEC,
      [MODE.INTERFACE_CONFIG]: MODE.GLOBAL_CONFIG,
      [MODE.LINE_CONFIG]:      MODE.GLOBAL_CONFIG,
      [MODE.ROUTER_CONFIG]:    MODE.GLOBAL_CONFIG,
      [MODE.ACL_CONFIG]:       MODE.GLOBAL_CONFIG,
      [MODE.DHCP_CONFIG]:      MODE.GLOBAL_CONFIG,
    };
    // 'end' jumps straight to PRIVILEGED_EXEC from any config mode
    if (cmd === 'end' && this._mode !== MODE.USER_EXEC && this._mode !== MODE.PRIVILEGED_EXEC) {
      return this._setMode(MODE.PRIVILEGED_EXEC);
    }
    if (transitions[this._mode]) {
      return this._setMode(transitions[this._mode]);
    }
    this._print('Bye!', 'text-gray-400');
    return { lines: [] };
  }

  // ─── show Renderers ───────────────────────────────────────────────────────

  _renderRunningConfig() {
    const c = this._config;
    const out = [
      { text: 'Building configuration...', cls: 'text-yellow-300' },
      { text: '', cls: '' },
      { text: 'Current configuration:', cls: 'text-green-300' },
      { text: '!', cls: 'text-gray-500' },
      { text: `hostname ${c.hostname}`, cls: 'text-white' },
      { text: '!', cls: 'text-gray-500' },
    ];
    if (c.enableSecret)  out.push({ text: `enable secret ${c.enableSecret}`, cls: 'text-white' });
    if (c.banner)        out.push({ text: `banner motd ^C${c.banner}^C`, cls: 'text-white' });
    if (c.ipRouting)     out.push({ text: 'ip routing', cls: 'text-white' });
    if (c.ipv6Routing)   out.push({ text: 'ipv6 unicast-routing', cls: 'text-white' });

    out.push({ text: '!', cls: 'text-gray-500' });

    for (const [name, iface] of Object.entries(c.interfaces)) {
      out.push({ text: `interface ${name}`, cls: 'text-cyan-300' });
      if (iface.description) out.push({ text: ` description ${iface.description}`, cls: 'text-white' });
      if (iface.ip)          out.push({ text: ` ip address ${iface.ip} ${iface.mask}`, cls: 'text-white' });
      if (iface.duplex)      out.push({ text: ` duplex ${iface.duplex}`, cls: 'text-white' });
      if (iface.speed)       out.push({ text: ` speed ${iface.speed}`, cls: 'text-white' });
      if (iface.switchport?.mode) out.push({ text: ` switchport mode ${iface.switchport.mode}`, cls: 'text-white' });
      if (iface.switchport?.accessVlan) out.push({ text: ` switchport access vlan ${iface.switchport.accessVlan}`, cls: 'text-white' });
      if (iface.portSecurity?.enabled) {
        out.push({ text: ' switchport port-security', cls: 'text-white' });
        if (iface.portSecurity.maximum) out.push({ text: ` switchport port-security maximum ${iface.portSecurity.maximum}`, cls: 'text-white' });
        if (iface.portSecurity.sticky)  out.push({ text: ' switchport port-security mac-address sticky', cls: 'text-white' });
        if (iface.portSecurity.macAddresses) iface.portSecurity.macAddresses.forEach(m =>
          out.push({ text: ` switchport port-security mac-address ${m}`, cls: 'text-white' }));
        if (iface.portSecurity.violation) out.push({ text: ` switchport port-security violation ${iface.portSecurity.violation}`, cls: 'text-white' });
      }
      if (iface.natInside)  out.push({ text: ' ip nat inside',  cls: 'text-white' });
      if (iface.natOutside) out.push({ text: ' ip nat outside', cls: 'text-white' });
      if (iface.acl) out.push({ text: ` ip access-group ${iface.acl.name} ${iface.acl.direction}`, cls: 'text-white' });
      if (iface.ipv6) iface.ipv6.forEach(a => out.push({ text: ` ipv6 address ${a}`, cls: 'text-white' }));
      if (iface.channelGroup) out.push({ text: ` channel-group ${iface.channelGroup.id} mode ${iface.channelGroup.mode}`, cls: 'text-white' });
      if (iface.spanningTreePortfast) out.push({ text: ' spanning-tree portfast', cls: 'text-white' });
      if (iface.hsrp) {
        for (const [gid, h] of Object.entries(iface.hsrp)) {
          const g = gid === '0' ? '' : ` ${gid}`;
          if (h.ip)       out.push({ text: ` standby${g} ip ${h.ip}`, cls: 'text-white' });
          if (h.priority) out.push({ text: ` standby${g} priority ${h.priority}`, cls: 'text-white' });
          if (h.preempt)  out.push({ text: ` standby${g} preempt`, cls: 'text-white' });
        }
      }
      out.push({ text: iface.shutdown ? ' shutdown' : ' no shutdown', cls: 'text-white' });
      out.push({ text: '!', cls: 'text-gray-500' });
    }

    if (c.routing.rip) {
      out.push({ text: 'router rip', cls: 'text-cyan-300' });
      out.push({ text: ` version ${c.routing.rip.version}`, cls: 'text-white' });
      c.routing.rip.networks.forEach(n => out.push({ text: ` network ${n}`, cls: 'text-white' }));
      out.push({ text: '!', cls: 'text-gray-500' });
    }

    for (const [pid, ospf] of Object.entries(c.routing.ospf)) {
      out.push({ text: `router ospf ${pid}`, cls: 'text-cyan-300' });
      if (ospf.routerId) out.push({ text: ` router-id ${ospf.routerId}`, cls: 'text-white' });
      ospf.networks.forEach(n => out.push({ text: ` network ${n.net} ${n.wildcard} area ${n.area}`, cls: 'text-white' }));
      out.push({ text: '!', cls: 'text-gray-500' });
    }

    c.routing.static.forEach(r =>
      out.push({ text: `ip route ${r.network} ${r.mask} ${r.nextHop}`, cls: 'text-white' }));
    (c.routing.ipv6Static || []).forEach(r =>
      out.push({ text: `ipv6 route ${r.prefix} ${r.nextHop}`, cls: 'text-white' }));

    // DHCP excluded / pools
    (c.dhcpExcluded || []).forEach(e =>
      out.push({ text: e.start === e.end ? `ip dhcp excluded-address ${e.start}` : `ip dhcp excluded-address ${e.start} ${e.end}`, cls: 'text-white' }));
    for (const [name, pool] of Object.entries(c.dhcp || {})) {
      out.push({ text: `ip dhcp pool ${name}`, cls: 'text-cyan-300' });
      if (pool.network) out.push({ text: ` network ${pool.network} ${pool.mask}`, cls: 'text-white' });
      if (pool.defaultRouter) out.push({ text: ` default-router ${pool.defaultRouter}`, cls: 'text-white' });
      if (pool.dns) out.push({ text: ` dns-server ${pool.dns}`, cls: 'text-white' });
      out.push({ text: '!', cls: 'text-gray-500' });
    }

    // NAT pools and inside source rules
    for (const [name, pool] of Object.entries(c.nat?.pools || {})) {
      out.push({ text: `ip nat pool ${name} ${pool.start} ${pool.end} netmask ${pool.netmask}`, cls: 'text-white' });
    }
    for (const src of (c.nat?.insideSources || [])) {
      if (src.type === 'static') {
        out.push({ text: `ip nat inside source static ${src.insideIp} ${src.outsideIp}`, cls: 'text-white' });
      } else if (src.type === 'overload') {
        out.push({ text: `ip nat inside source list ${src.aclNum} interface ${src.interface} overload`, cls: 'text-white' });
      } else if (src.type === 'pool') {
        out.push({ text: `ip nat inside source list ${src.aclNum} pool ${src.poolName}${src.overload ? ' overload' : ''}`, cls: 'text-white' });
      }
    }

    // STP mode / vlan priorities
    if (c.spanning_tree.mode && c.spanning_tree.mode !== 'pvst') {
      out.push({ text: `spanning-tree mode ${c.spanning_tree.mode}`, cls: 'text-white' });
    }
    for (const [vlan, pri] of Object.entries(c.spanning_tree.vlanPriority || {})) {
      out.push({ text: `spanning-tree vlan ${vlan} priority ${pri}`, cls: 'text-white' });
    }

    // ACL definitions — named ACLs as blocks, numbered ACLs as single lines
    for (const [name, entries] of Object.entries(c.acls)) {
      if (c.namedAcls[name]) {
        out.push({ text: `ip access-list ${c.namedAcls[name]} ${name}`, cls: 'text-cyan-300' });
        entries.forEach(e => out.push({ text: ` ${e}`, cls: 'text-white' }));
        out.push({ text: '!', cls: 'text-gray-500' });
      } else {
        entries.forEach(entry =>
          out.push({ text: `access-list ${name} ${entry}`, cls: 'text-white' }));
        out.push({ text: '!', cls: 'text-gray-500' });
      }
    }

    out.push({ text: 'end', cls: 'text-gray-400' });
    return out;
  }

  _renderInterfaces(filter = null) {
    const out = [];
    const ifaces = Object.entries(this._config.interfaces);
    if (!ifaces.length) {
      out.push({ text: 'No interfaces configured.', cls: 'text-gray-400' });
      return out;
    }
    for (const [name, iface] of ifaces) {
      if (filter && name !== filter) continue;
      const state = iface.shutdown ? 'administratively down' : 'up';
      const lstate = iface.shutdown ? 'down' : 'up';
      out.push({ text: `${name} is ${state}, line protocol is ${lstate}`, cls: 'text-green-300' });
      if (iface.description) out.push({ text: `  Description: ${iface.description}`, cls: 'text-white' });
      if (iface.ip) out.push({ text: `  Internet address is ${iface.ip}/${this._maskToCidr(iface.mask)}`, cls: 'text-white' });
      out.push({ text: '  MTU 1500 bytes, BW 1000000 Kbit/sec', cls: 'text-gray-400' });
    }
    return out;
  }

  _renderIpInterfaces() {
    return this._renderInterfaces();
  }

  _renderRoutes() {
    const out = [{ text: 'Codes: C - connected, S - static, R - RIP, O - OSPF', cls: 'text-gray-400' }, { text: '', cls: '' }];
    const cfg = this._config;

    for (const [name, iface] of Object.entries(cfg.interfaces)) {
      if (iface.ip) {
        out.push({ text: `C    ${iface.ip}/? is directly connected, ${name}`, cls: 'text-green-300' });
      }
    }
    cfg.routing.static.forEach(r =>
      out.push({ text: `S    ${r.network} [1/0] via ${r.nextHop}`, cls: 'text-white' }));
    if (cfg.routing.rip) {
      cfg.routing.rip.networks.forEach(n =>
        out.push({ text: `R    ${n}.0.0.0/8 [120/1] via (RIP)`, cls: 'text-cyan-300' }));
    }
    if (!out.length) out.push({ text: '% No routes found.', cls: 'text-gray-400' });
    return out;
  }

  _renderVlans() {
    const out = [
      { text: 'VLAN Name                             Status    Ports', cls: 'text-green-300' },
      { text: '---- -------------------------------- --------- -------------------------------', cls: 'text-gray-500' },
    ];
    for (const [id, vlan] of Object.entries(this._config.vlans)) {
      out.push({ text: `${id.padEnd(4)} ${vlan.name.padEnd(32)} active`, cls: 'text-white' });
    }
    return out;
  }

  _renderAccessLists() {
    const out = [];
    const acls = this._config.acls;
    if (!Object.keys(acls).length) {
      out.push({ text: 'No access lists defined.', cls: 'text-gray-400' });
      return out;
    }
    for (const [name, entries] of Object.entries(acls)) {
      if (!entries.length) continue;
      const type = isNaN(name)
        ? 'Named IP access list'
        : Number(name) <= 99 ? 'Standard IP access list' : 'Extended IP access list';
      out.push({ text: `${type} ${name}`, cls: 'text-green-300' });
      entries.forEach((entry, i) => {
        out.push({ text: `    ${(i + 1) * 10} ${entry}`, cls: 'text-white' });
      });
    }
    return out;
  }

  // ─── Validate ─────────────────────────────────────────────────────────────

  /**
   * Compare running config against a targetConfig JSON.
   * Returns { pass, missing, extra, score } for grading.
   *
   * targetConfig shape (partial match — only specified keys are checked):
   * {
   *   hostname: 'R1',
   *   interfaces: { 'GigabitEthernet0/0': { ip: '10.0.0.1', mask: '255.255.255.0', shutdown: false } },
   *   routing: { static: [{ network: '0.0.0.0', mask: '0.0.0.0', nextHop: '10.0.0.254' }] },
   *   lines: { vty: { login: true } }
   * }
   */
  validate(targetConfig = this._labTarget) {
    if (!targetConfig) return { pass: false, missing: ['No target config loaded.'], extra: [], score: 0 };

    // Multi-device: validate each device independently
    if (this._devices) {
      const allMissing = [];
      let totalChecks = 0;
      for (const [devName, devTarget] of Object.entries(targetConfig)) {
        const devConfig = this._devices[devName];
        if (!devConfig) { allMissing.push(`Device ${devName} not found`); continue; }
        const r = this._validateSingle(devConfig, devTarget);
        r.missing.forEach(m => allMissing.push(`[${devName}] ${m}`));
        totalChecks += r.totalChecks;
      }
      const passed = totalChecks - allMissing.length;
      const score  = totalChecks > 0 ? Math.round((passed / totalChecks) * 100) : 100;
      const pass   = allMissing.length === 0;
      bus.emit('lab:validated', { labId: this._labId, pass, score, missing: allMissing, extra: [] });
      return { pass, missing: allMissing, extra: [], score };
    }

    const { missing, totalChecks } = this._validateSingle(this._config, targetConfig);
    const extra  = [];
    const passed = totalChecks - missing.length;
    const score  = totalChecks > 0 ? Math.round((passed / totalChecks) * 100) : 100;
    const pass   = missing.length === 0;

    bus.emit('lab:validated', { labId: this._labId, pass, score, missing, extra });
    return { pass, missing, extra, score };
  }

  /** Validate a single device config against a targetConfig. Returns { missing[], totalChecks }. */
  _validateSingle(current, targetConfig) {
    const missing = [];

    // Hostname
    if (targetConfig.hostname && current.hostname !== targetConfig.hostname) {
      missing.push(`hostname should be "${targetConfig.hostname}" (got "${current.hostname}")`);
    }

    // Interfaces
    for (const [ifName, target] of Object.entries(targetConfig.interfaces || {})) {
      const actual = current.interfaces[ifName];
      if (!actual) { missing.push(`interface ${ifName} not configured`); continue; }
      if (target.ip   !== undefined && actual.ip   !== target.ip)   missing.push(`${ifName}: IP should be ${target.ip} (got ${actual.ip})`);
      if (target.mask !== undefined && actual.mask !== target.mask) missing.push(`${ifName}: mask should be ${target.mask}`);
      if (target.shutdown !== undefined && actual.shutdown !== target.shutdown) {
        missing.push(`${ifName}: should be ${target.shutdown ? 'shutdown' : 'no shutdown'}`);
      }
      if (target.description !== undefined && actual.description !== target.description) {
        missing.push(`${ifName}: description mismatch`);
      }
      // ACL application
      if (target.acl) {
        if (!actual.acl)
          missing.push(`${ifName}: ip access-group ${target.acl.name} ${target.acl.direction} not applied`);
        else {
          if (target.acl.name && actual.acl.name !== target.acl.name)
            missing.push(`${ifName}: access-group should be "${target.acl.name}" (got "${actual.acl.name}")`);
          if (target.acl.direction && actual.acl.direction !== target.acl.direction)
            missing.push(`${ifName}: access-group direction should be "${target.acl.direction}"`);
        }
      }
      // Spanning-tree portfast
      if (target.spanningTreePortfast && !actual.spanningTreePortfast)
        missing.push(`${ifName}: spanning-tree portfast not configured`);

      // IPv6 addresses
      for (const addr of (target.ipv6 || [])) {
        if (!(actual.ipv6 || []).includes(addr))
          missing.push(`${ifName}: ipv6 address ${addr} missing`);
      }
      // HSRP
      if (target.hsrp) {
        for (const [gid, th] of Object.entries(target.hsrp)) {
          const ah = actual.hsrp?.[gid];
          if (!ah) { missing.push(`${ifName}: standby ${gid} not configured`); continue; }
          if (th.ip && ah.ip !== th.ip)             missing.push(`${ifName}: standby ${gid} ip should be ${th.ip}`);
          if (th.priority !== undefined && ah.priority !== th.priority) missing.push(`${ifName}: standby ${gid} priority should be ${th.priority}`);
          if (th.preempt && !ah.preempt)            missing.push(`${ifName}: standby ${gid} preempt missing`);
        }
      }
      // EtherChannel
      if (target.channelGroup) {
        const ac = actual.channelGroup;
        if (!ac) { missing.push(`${ifName}: channel-group not configured`); }
        else {
          if (target.channelGroup.id !== undefined && String(ac.id) !== String(target.channelGroup.id))
            missing.push(`${ifName}: channel-group id should be ${target.channelGroup.id}`);
          if (target.channelGroup.mode && ac.mode !== target.channelGroup.mode)
            missing.push(`${ifName}: channel-group mode should be ${target.channelGroup.mode}`);
        }
      }
      // NAT inside/outside on interface
      if (target.natInside && !actual.natInside)
        missing.push(`${ifName}: ip nat inside not configured`);
      if (target.natOutside && !actual.natOutside)
        missing.push(`${ifName}: ip nat outside not configured`);

      // Port security
      if (target.portSecurity) {
        const ps = actual.portSecurity;
        if (!ps?.enabled) {
          missing.push(`${ifName}: port-security not enabled`);
        } else {
          if (target.portSecurity.maximum !== undefined && ps.maximum !== target.portSecurity.maximum)
            missing.push(`${ifName}: port-security maximum should be ${target.portSecurity.maximum}`);
          if (target.portSecurity.violation !== undefined && ps.violation !== target.portSecurity.violation)
            missing.push(`${ifName}: port-security violation should be ${target.portSecurity.violation}`);
          if (target.portSecurity.sticky && !ps.sticky)
            missing.push(`${ifName}: port-security mac-address sticky not configured`);
        }
      }
    }

    // Static Routes
    for (const route of (targetConfig.routing?.static || [])) {
      const found = current.routing.static.find(r =>
        r.network === route.network && r.mask === route.mask && r.nextHop === route.nextHop);
      if (!found) missing.push(`Static route: ${route.network} ${route.mask} via ${route.nextHop} missing`);
    }

    // RIP
    if (targetConfig.routing?.rip) {
      if (!current.routing.rip) {
        missing.push('Router RIP not configured');
      } else {
        const tr = targetConfig.routing.rip;
        if (tr.version && current.routing.rip.version !== tr.version)
          missing.push(`RIP version should be ${tr.version}`);
        (tr.networks || []).forEach(n => {
          if (!current.routing.rip.networks.includes(n))
            missing.push(`RIP network ${n} missing`);
        });
      }
    }

    // Lines
    for (const [lineType, target] of Object.entries(targetConfig.lines || {})) {
      const actual = current.lines[lineType];
      if (!actual) { missing.push(`line ${lineType} not configured`); continue; }
      if (target.login !== undefined && actual.login !== target.login)
        missing.push(`line ${lineType}: login ${target.login ? 'required' : 'not required'}`);
      if (target.password !== undefined && actual.password !== target.password)
        missing.push(`line ${lineType}: password mismatch`);
    }

    // Enable Secret
    if (targetConfig.enableSecret !== undefined) {
      if (current.enableSecret !== targetConfig.enableSecret)
        missing.push(`enable secret should be "${targetConfig.enableSecret}"`);
    }

    // OSPF
    for (const [pid, targetOspf] of Object.entries(targetConfig.routing?.ospf || {})) {
      const actualOspf = current.routing.ospf[pid];
      if (!actualOspf) { missing.push(`router ospf ${pid} not configured`); continue; }
      if (targetOspf.routerId && actualOspf.routerId !== targetOspf.routerId)
        missing.push(`ospf ${pid}: router-id should be ${targetOspf.routerId}`);
      for (const tn of (targetOspf.networks || [])) {
        const found = actualOspf.networks.find(an =>
          an.net === tn.net && an.wildcard === tn.wildcard && String(an.area) === String(tn.area));
        if (!found) missing.push(`ospf ${pid}: network ${tn.net} ${tn.wildcard} area ${tn.area} missing`);
      }
    }

    // VLANs
    for (const vlanId of Object.keys(targetConfig.vlans || {})) {
      if (!current.vlans[vlanId]) missing.push(`vlan ${vlanId} not created`);
    }

    // IP routing (Layer 3 switch)
    if (targetConfig.ipRouting !== undefined && current.ipRouting !== targetConfig.ipRouting) {
      missing.push('ip routing not enabled');
    }

    // IPv6 unicast-routing
    if (targetConfig.ipv6Routing !== undefined && current.ipv6Routing !== targetConfig.ipv6Routing) {
      missing.push('ipv6 unicast-routing not enabled');
    }

    // IPv6 static routes
    for (const route of (targetConfig.routing?.ipv6Static || [])) {
      const found = (current.routing.ipv6Static || []).find(r =>
        r.prefix === route.prefix && r.nextHop === route.nextHop);
      if (!found) missing.push(`IPv6 static route ${route.prefix} via ${route.nextHop} missing`);
    }

    // DHCP excluded
    for (const ex of (targetConfig.dhcpExcluded || [])) {
      const found = (current.dhcpExcluded || []).find(e => e.start === ex.start && e.end === (ex.end || ex.start));
      if (!found) missing.push(`ip dhcp excluded-address ${ex.start}${ex.end && ex.end !== ex.start ? ' ' + ex.end : ''} missing`);
    }

    // DHCP pools
    for (const [poolName, targetPool] of Object.entries(targetConfig.dhcp || {})) {
      const actual = current.dhcp?.[poolName];
      if (!actual) { missing.push(`ip dhcp pool ${poolName} not configured`); continue; }
      if (targetPool.network && actual.network !== targetPool.network)
        missing.push(`DHCP pool ${poolName}: network should be ${targetPool.network}`);
      if (targetPool.mask && actual.mask !== targetPool.mask)
        missing.push(`DHCP pool ${poolName}: mask should be ${targetPool.mask}`);
      if (targetPool.defaultRouter && actual.defaultRouter !== targetPool.defaultRouter)
        missing.push(`DHCP pool ${poolName}: default-router should be ${targetPool.defaultRouter}`);
      if (targetPool.dns && actual.dns !== targetPool.dns)
        missing.push(`DHCP pool ${poolName}: dns-server should be ${targetPool.dns}`);
    }

    // NAT
    if (targetConfig.nat) {
      const tnat = targetConfig.nat, cnat = current.nat || { insideSources: [], pools: {} };
      // Validate pools
      for (const [poolName, tp] of Object.entries(tnat.pools || {})) {
        const ap = cnat.pools[poolName];
        if (!ap) { missing.push(`ip nat pool ${poolName} not configured`); }
        else {
          if (tp.start && ap.start !== tp.start) missing.push(`nat pool ${poolName}: start IP should be ${tp.start}`);
          if (tp.end   && ap.end   !== tp.end)   missing.push(`nat pool ${poolName}: end IP should be ${tp.end}`);
        }
      }
      // Validate inside source rules (order-independent match)
      for (const ts of (tnat.insideSources || [])) {
        const found = (cnat.insideSources || []).some(as => {
          if (as.type !== ts.type) return false;
          if (ts.type === 'static')   return as.insideIp === ts.insideIp && as.outsideIp === ts.outsideIp;
          if (ts.type === 'overload') return as.aclNum === ts.aclNum && as.interface === ts.interface;
          if (ts.type === 'pool')     return as.aclNum === ts.aclNum && as.poolName === ts.poolName;
          return false;
        });
        if (!found) {
          if (ts.type === 'static')   missing.push(`ip nat inside source static ${ts.insideIp} ${ts.outsideIp} missing`);
          if (ts.type === 'overload') missing.push(`ip nat inside source list ${ts.aclNum} interface ${ts.interface} overload missing`);
          if (ts.type === 'pool')     missing.push(`ip nat inside source list ${ts.aclNum} pool ${ts.poolName} missing`);
        }
      }
      // Interface nat inside/outside checks come through targetConfig.interfaces
    }

    // Spanning-tree
    if (targetConfig.spanning_tree) {
      const ts = targetConfig.spanning_tree, cs = current.spanning_tree;
      if (ts.mode && cs.mode !== ts.mode) missing.push(`spanning-tree mode should be ${ts.mode} (got ${cs.mode})`);
      for (const [vlan, pri] of Object.entries(ts.vlanPriority || {})) {
        const actual = (cs.vlanPriority || {})[vlan];
        if (actual !== pri) missing.push(`spanning-tree vlan ${vlan} priority should be ${pri} (got ${actual ?? 'default'})`);
      }
    }

    // ACLs
    for (const [aclName, targetAcl] of Object.entries(targetConfig.acls || {})) {
      const actualEntries = current.acls[aclName];
      if (!actualEntries || actualEntries.length === 0) {
        missing.push(`access-list ${aclName} not configured`); continue;
      }
      for (const required of (targetAcl.entries || [])) {
        const norm = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
        const found = actualEntries.some(e => norm(e).includes(norm(required)));
        if (!found) missing.push(`access-list ${aclName}: entry "${required}" missing`);
      }
    }

    const totalChecks = this._countChecks(targetConfig);
    return { missing, totalChecks };
  }

  _countChecks(target) {
    let n = 0;
    if (target.hostname)      n++;
    if (target.enableSecret !== undefined) n++;
    for (const iface of Object.values(target.interfaces || {})) {
      if (iface.ip !== undefined)          n++;
      if (iface.mask !== undefined)        n++;
      if (iface.shutdown !== undefined)    n++;
      if (iface.description !== undefined) n++;
      if (iface.acl !== undefined)         n++;
      if (iface.portSecurity !== undefined) {
        n++; // enabled check
        if (iface.portSecurity.maximum !== undefined)   n++;
        if (iface.portSecurity.violation !== undefined) n++;
        if (iface.portSecurity.sticky !== undefined)    n++;
      }
      if (iface.spanningTreePortfast) n++;
      if (iface.natInside)  n++;
      if (iface.natOutside) n++;
      if (iface.ipv6?.length)  n += iface.ipv6.length;
      if (iface.channelGroup)  n++;
      if (iface.hsrp) {
        for (const h of Object.values(iface.hsrp)) {
          if (h.ip) n++;
          if (h.priority !== undefined) n++;
          if (h.preempt) n++;
        }
      }
    }
    n += (target.routing?.static?.length || 0);
    n += (target.routing?.ipv6Static?.length || 0);
    n += Object.keys(target.vlans || {}).length;
    if (target.ipRouting  !== undefined) n++;
    if (target.ipv6Routing !== undefined) n++;
    n += (target.dhcpExcluded?.length || 0);
    for (const pool of Object.values(target.dhcp || {})) {
      n++; // existence
      if (pool.network) n++;
      if (pool.defaultRouter) n++;
      if (pool.dns) n++;
    }
    if (target.spanning_tree) {
      if (target.spanning_tree.mode) n++;
      n += Object.keys(target.spanning_tree.vlanPriority || {}).length;
    }
    if (target.routing?.rip) {
      n++;
      n += (target.routing.rip.networks?.length || 0);
    }
    for (const ospf of Object.values(target.routing?.ospf || {})) {
      n++; // process existence
      if (ospf.routerId) n++;
      n += (ospf.networks?.length || 0);
    }
    for (const acl of Object.values(target.acls || {})) {
      n++; // acl existence
      n += (acl.entries?.length || 0);
    }
    for (const line of Object.values(target.lines || {})) {
      if (line.login !== undefined)    n++;
      if (line.password !== undefined) n++;
    }
    // NAT
    if (target.nat) {
      n += Object.keys(target.nat.pools || {}).length;
      n += (target.nat.insideSources?.length || 0);
    }
    return n || 1;
  }

  // ─── Mode Transitions ─────────────────────────────────────────────────────

  _setMode(mode, opts = {}) {
    this._mode = mode;
    if (opts.prompt) this._print(opts.prompt);
    return { lines: [], modeChange: true };
  }

  get prompt() {
    return PROMPT_FN[this._mode](this.hostname, this._context);
  }

  _refreshPrompt() {
    if (this.promptEl) this.promptEl.textContent = this.prompt + ' ';
  }

  // ─── DOM Helpers ──────────────────────────────────────────────────────────

  _print(text, cls = 'text-green-300') {
    if (!this.outputEl) return;
    const line = document.createElement('div');
    line.className = cls;
    line.textContent = text;
    this.outputEl.appendChild(line);
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  }

  _echoInput(text) {
    if (!this.outputEl) return;
    const line = document.createElement('div');
    line.className = 'flex gap-2';
    line.innerHTML = `<span class="text-yellow-400 select-none">${this.prompt} </span><span class="text-white">${this._escHtml(text)}</span>`;
    this.outputEl.appendChild(line);
  }

  _clearOutput() {
    if (this.outputEl) this.outputEl.innerHTML = '';
  }

  _err(msg) {
    return { lines: [{ text: msg, cls: 'text-red-400' }] };
  }

  _unknownCmd(cmd) {
    return this._err(`% Unrecognized command: ${cmd}`);
  }

  _unknownOrPriv(cmd) {
    return this._err(`% Unknown command or access level too low: ${cmd}`);
  }

  _escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  _isAbbrev(input, full) {
    if (!input || !full) return false;
    return full.startsWith(input.toLowerCase()) || input.toLowerCase() === full.toLowerCase();
  }

  _maskToCidr(mask) {
    if (!mask) return '?';
    return mask.split('.').reduce((acc, oct) => {
      let n = parseInt(oct);
      let bits = 0;
      while (n) { bits += n & 1; n >>= 1; }
      return acc + bits;
    }, 0);
  }

  // ─── Keyboard Navigation ──────────────────────────────────────────────────

  _bindKeys() {
    if (!this.inputEl) return;
    this.inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        this.execute(this.inputEl.value);
        this.inputEl.value = '';
        this._refreshPrompt();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this._historyIdx < this._history.length - 1) {
          this._historyIdx++;
          this.inputEl.value = this._history[this._historyIdx];
        }
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this._historyIdx > 0) {
          this._historyIdx--;
          this.inputEl.value = this._history[this._historyIdx];
        } else {
          this._historyIdx = -1;
          this.inputEl.value = '';
        }
      }
      if (e.key === '?' && !e.ctrlKey) {
        e.preventDefault();
        const partial = this.inputEl.value;
        this._echoInput(partial + '?');
        this.execute('?');
      }
    });
  }

  reset() {
    this._config     = makeBlankConfig(this.hostname);
    this._mode       = MODE.USER_EXEC;
    this._context    = {};
    this._history    = [];
    this._historyIdx = -1;
    this._clearOutput();
    this._refreshPrompt();
    this._print('Terminal reset.', 'text-gray-400');
  }

  get runningConfig() {
    return structuredClone(this._config);
  }
}
