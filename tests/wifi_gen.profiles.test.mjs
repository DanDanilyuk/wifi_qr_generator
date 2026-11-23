// wifi_gen.sh finds the current network on macOS by asking which saved network
// was last joined through the router the Mac is talking to right now. The
// choosing is done by a small JavaScript function embedded in the script (it
// runs under osascript). This pulls that function out and tests it directly,
// so it is covered on any OS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../wifi_gen.sh', import.meta.url), 'utf8');
const embedded = script.match(/<<'JXA'[^\n]*\n([\s\S]*?)\nJXA\n/);

assert.ok(embedded, "wifi_gen.sh has an embedded <<'JXA' block");

const currentNetwork = new Function(`${embedded[1]}\nreturn currentNetwork;`)();

const HOME =
  'IPv4.Router=192.168.0.1;IPv4.RouterHardwareAddress=aa:aa:aa:aa:aa:ff';
const OFFICE =
  'IPv4.Router=10.0.0.1;IPv4.RouterHardwareAddress=bb:bb:bb:bb:bb:ff';

// The shape macOS prints for a saved network. Each access point the network
// was used with is one {...} entry.
function profile(name, accessPoints) {
  const entries = accessPoints
    .map(
      ([joined, signature]) => `        {
        AssociatedAt = "${joined} +0000";
        BSSID = "aa:aa:aa:aa:aa:01";
        Channel = 36;
        DHCPv6ServerID = {length = 14, bytes = 0x0001000132376f6ff04b8a4733e6};
        IPv4NetworkSignature = "${signature}";
        IPv6NetworkSignature = "IPv6.Prefix=fd00::/64;IPv6.RouterHardwareAddress=aa:aa:aa:aa:aa:ff";
    }`
    )
    .join(',\n');

  return {
    name,
    text: `SSID: ${name} ({length = 4, bytes = 0x00000000})
Security: WPA2/WPA3 Personal
Hidden: No
BSSID List: (
${entries}
)
Share Mode: Enabled`,
  };
}

test('finds the saved network that was joined through the current router', () => {
  const profiles = [
    profile('Office', [['2026-11-20 09:00:00', OFFICE]]),
    profile('Home', [['2026-11-01 18:00:00', HOME]]),
  ];

  assert.equal(currentNetwork(profiles, HOME), 'Home');
  assert.equal(currentNetwork(profiles, OFFICE), 'Office');
});

test('two names on one router: the one joined most recently is the current one', () => {
  const profiles = [
    profile('Home', [['2026-11-12 03:34:49', HOME]]),
    profile('Home-5G', [['2026-11-23 01:14:03', HOME]]),
  ];

  assert.equal(currentNetwork(profiles, HOME), 'Home-5G');
  assert.equal(currentNetwork(profiles.reverse(), HOME), 'Home-5G');
});

test('a network used in several places is judged by its entry for this router', () => {
  // "Chain Cafe" was joined more recently than "Home", but somewhere else.
  const profiles = [
    profile('Chain Cafe', [
      ['2026-11-22 12:00:00', OFFICE],
      ['2026-10-01 12:00:00', HOME],
    ]),
    profile('Home', [['2026-11-21 20:00:00', HOME]]),
  ];

  assert.equal(currentNetwork(profiles, HOME), 'Home');
});

test('no saved network knows this router: no answer rather than a guess', () => {
  const profiles = [profile('Office', [['2026-11-20 09:00:00', OFFICE]])];

  assert.equal(currentNetwork(profiles, HOME), '');
  assert.equal(currentNetwork([], HOME), '');
});

test('without a router to match, never picks one', () => {
  const profiles = [profile('Home', [['2026-11-21 20:00:00', HOME]])];

  assert.equal(currentNetwork(profiles, ''), '');
  assert.equal(currentNetwork(profiles, undefined), '');
});

test('saved networks that were never joined, or have no name, are skipped', () => {
  const profiles = [
    profile('Never Joined', []),
    {
      name: undefined,
      text: profile('x', [['2026-11-23 00:00:00', HOME]]).text,
    },
    { name: 'No Details', text: undefined },
    profile('Home', [['2026-11-21 20:00:00', HOME]]),
  ];

  assert.equal(currentNetwork(profiles, HOME), 'Home');
});

test('a router address that is only the start of another does not match', () => {
  const longer = `${HOME}0`;
  const profiles = [profile('Other', [['2026-11-23 00:00:00', longer]])];

  assert.equal(currentNetwork(profiles, HOME), '');
});
