/**
 * Printer Diagnostics
 * ───────────────────
 * Runs a sequence of checks to tell the user exactly which layer is failing
 * when a printer is unreachable. Each check is independent so a single
 * failure doesn't break the rest of the report.
 */

import printerService from './printer';
import { getAuthToken } from './api';

const PASS = 'pass';
const FAIL = 'fail';
const WARN = 'warn';
const INFO = 'info';

const isNative = () =>
  typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();

const getPlatform = () => {
  if (!isNative()) return 'web';
  return window.Capacitor.getPlatform?.() || 'unknown';
};

// ───────────────────────────────────────────────────────────────────
// Individual checks
// ───────────────────────────────────────────────────────────────────

async function checkRuntimeEnvironment() {
  const platform = getPlatform();
  const isApk = platform === 'android';
  const isIos = platform === 'ios';
  return {
    id: 'env',
    label: 'Runtime environment',
    status: PASS,
    detail: isApk
      ? 'Android APK (native)'
      : isIos
      ? 'iOS app (native)'
      : 'Web browser / PWA — local-network discovery is limited',
    suggestion: isApk || isIos ? null : 'For full LAN scan + mDNS, install the APK or iOS build.',
  };
}

async function checkTabletNetwork() {
  if (!isNative()) {
    return {
      id: 'wifi',
      label: 'Tablet Wi-Fi / IP address',
      status: INFO,
      detail: 'Not available in browser. Quick Connect with manual IP still works.',
    };
  }
  try {
    const subnet = await printerService.getDeviceSubnet();
    if (subnet) {
      return {
        id: 'wifi',
        label: 'Tablet Wi-Fi / IP address',
        status: PASS,
        detail: `Connected. Tablet subnet: ${subnet}.x`,
      };
    }
    return {
      id: 'wifi',
      label: 'Tablet Wi-Fi / IP address',
      status: FAIL,
      detail: 'Could not read the tablet IP.',
      suggestion: 'Make sure Wi-Fi is on. If still failing, the APK may be missing the ACCESS_WIFI_STATE permission — rebuild the APK with the latest code.',
    };
  } catch (e) {
    return {
      id: 'wifi',
      label: 'Tablet Wi-Fi / IP address',
      status: FAIL,
      detail: `Error: ${e.message || e}`,
    };
  }
}

async function checkTcpPlugin() {
  if (!isNative()) {
    return {
      id: 'tcp',
      label: 'TCP socket plugin',
      status: INFO,
      detail: 'Not loaded in browser (expected). Web/PWA cannot open raw TCP sockets to printers.',
    };
  }
  try {
    const mod = await import('capacitor-tcp-socket');
    if (mod?.TcpSocket?.connect) {
      return {
        id: 'tcp',
        label: 'TCP socket plugin',
        status: PASS,
        detail: 'capacitor-tcp-socket loaded and ready',
      };
    }
    return {
      id: 'tcp',
      label: 'TCP socket plugin',
      status: FAIL,
      detail: 'Plugin imported but API not exposed.',
      suggestion: 'Run "npx cap sync" and rebuild the APK.',
    };
  } catch (e) {
    return {
      id: 'tcp',
      label: 'TCP socket plugin',
      status: FAIL,
      detail: `Could not load capacitor-tcp-socket: ${e.message || e}`,
      suggestion: 'Plugin missing from APK. Rebuild after running "npx cap sync".',
    };
  }
}

async function checkMdnsPlugin() {
  if (!isNative()) {
    return {
      id: 'mdns',
      label: 'Bonjour / mDNS plugin',
      status: INFO,
      detail: 'Not available in browser (expected). Use Quick Connect with manual IP.',
    };
  }
  try {
    const mod = await import('capacitor-zeroconf');
    const ZeroConf = mod.ZeroConf || mod.default?.ZeroConf || mod.default;
    if (ZeroConf && typeof ZeroConf.watch === 'function') {
      return {
        id: 'mdns',
        label: 'Bonjour / mDNS plugin',
        status: PASS,
        detail: 'capacitor-zeroconf loaded and ready',
      };
    }
    return {
      id: 'mdns',
      label: 'Bonjour / mDNS plugin',
      status: FAIL,
      detail: 'Plugin imported but API missing.',
      suggestion: 'Run "npx cap sync" and rebuild the APK.',
    };
  } catch (e) {
    return {
      id: 'mdns',
      label: 'Bonjour / mDNS plugin',
      status: WARN,
      detail: `Plugin not in APK. ${e.message || ''}`,
      suggestion: 'mDNS auto-discovery disabled. TCP sweep + Quick Connect still work. To enable: rebuild APK after running "npx cap sync".',
    };
  }
}

async function checkMdnsQuery() {
  if (!isNative()) {
    return {
      id: 'mdns-query',
      label: 'mDNS live test',
      status: INFO,
      detail: 'Skipped (not native).',
    };
  }
  try {
    const mod = await import('capacitor-zeroconf');
    const ZeroConf = mod.ZeroConf || mod.default?.ZeroConf || mod.default;
    if (!ZeroConf?.watch) {
      return {
        id: 'mdns-query',
        label: 'mDNS live test',
        status: INFO,
        detail: 'Skipped — plugin not loaded.',
      };
    }
    const seen = [];
    const handler = (event) => {
      if (event?.action !== 'resolved') return;
      const svc = event.service;
      const ip = (svc?.ipv4Addresses && svc.ipv4Addresses[0]) || svc?.hostname;
      if (ip) seen.push(`${svc.name || 'printer'} @ ${ip}`);
    };
    try {
      await ZeroConf.watch({ type: '_pdl-datastream._tcp.', domain: 'local.' }, handler);
      await new Promise((r) => setTimeout(r, 2500));
      await ZeroConf.unwatch({ type: '_pdl-datastream._tcp.', domain: 'local.' });
    } catch {}
    if (seen.length > 0) {
      return {
        id: 'mdns-query',
        label: 'mDNS live test',
        status: PASS,
        detail: `Discovered: ${seen.join(', ')}`,
      };
    }
    return {
      id: 'mdns-query',
      label: 'mDNS live test',
      status: WARN,
      detail: 'No printers responded to Bonjour in 2.5s.',
      suggestion:
        'Either your printer does not advertise Bonjour (older Epson TM-T20 or Bixolon need TCP sweep), OR the multicast packet is being blocked. Check that AndroidManifest has CHANGE_WIFI_MULTICAST_STATE and rebuild.',
    };
  } catch (e) {
    return {
      id: 'mdns-query',
      label: 'mDNS live test',
      status: WARN,
      detail: e.message || String(e),
    };
  }
}

async function checkTcpProbe(ip, port) {
  if (!ip) {
    return {
      id: 'tcp-probe',
      label: 'TCP probe (to printer IP)',
      status: INFO,
      detail: 'Enter the printer IP above and re-run to test reachability.',
    };
  }
  const ipRe = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipRe.test(ip)) {
    return {
      id: 'tcp-probe',
      label: `TCP probe → ${ip}:${port}`,
      status: FAIL,
      detail: 'Invalid IP address',
    };
  }

  const t0 = Date.now();
  try {
    if (isNative()) {
      const ok = await printerService.checkPrinterReachable(ip, port);
      const ms = Date.now() - t0;
      if (ok) {
        return {
          id: 'tcp-probe',
          label: `TCP probe → ${ip}:${port}`,
          status: PASS,
          detail: `Connected in ${ms}ms — printer is reachable`,
        };
      }
      return {
        id: 'tcp-probe',
        label: `TCP probe → ${ip}:${port}`,
        status: FAIL,
        detail: 'Connection refused or timeout',
        suggestion:
          'Either (1) the printer is on a different subnet than the tablet, (2) the Wi-Fi has "AP Isolation" enabled in the router admin, OR (3) the printer is offline. Print a self-test from the printer (hold FEED while turning on) and confirm the IP shown.',
      };
    }
    // Web fallback via backend probe
    const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/printers/probe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthToken()}` },
      body: JSON.stringify({ ip, port }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const ms = Date.now() - t0;
      if (data?.reachable !== false) {
        return {
          id: 'tcp-probe',
          label: `TCP probe → ${ip}:${port}`,
          status: PASS,
          detail: `Reachable via backend in ${ms}ms (web mode)`,
        };
      }
    }
    return {
      id: 'tcp-probe',
      label: `TCP probe → ${ip}:${port}`,
      status: FAIL,
      detail: 'Backend cannot reach the printer (expected in web mode for private IPs).',
      suggestion: 'Use the APK build on the tablet — the cloud backend cannot reach 192.168.x.x addresses.',
    };
  } catch (e) {
    return {
      id: 'tcp-probe',
      label: `TCP probe → ${ip}:${port}`,
      status: FAIL,
      detail: e.message || String(e),
    };
  }
}

// ───────────────────────────────────────────────────────────────────
// Main runner — yields each check as it completes
// ───────────────────────────────────────────────────────────────────
export async function* runPrinterDiagnostics({ testIp = '', testPort = 9100 } = {}) {
  yield { phase: 'starting', label: 'Starting diagnostics…' };

  const steps = [
    checkRuntimeEnvironment,
    checkTabletNetwork,
    checkTcpPlugin,
    checkMdnsPlugin,
    checkMdnsQuery,
    () => checkTcpProbe(testIp, testPort),
  ];

  for (const step of steps) {
    try {
      const result = await step();
      yield result;
    } catch (e) {
      yield {
        id: 'unknown',
        label: 'Diagnostic step crashed',
        status: FAIL,
        detail: e.message || String(e),
      };
    }
  }
}

export const DIAG_STATUSES = { PASS, FAIL, WARN, INFO };
