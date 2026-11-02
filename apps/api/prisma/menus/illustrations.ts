/**
 * Flat illustrations for menu sections (original drawings, 240×120), used as category pictures on the POS
 * tiles until the restaurant uploads its own photos. Each is a small SVG, synced as a data URL.
 */

const frame = (bg: [string, string], body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120">` +
  `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs>` +
  `<rect width="240" height="120" fill="url(#g)"/>` +
  `<circle cx="205" cy="18" r="34" fill="#fff" opacity=".12"/><circle cx="28" cy="108" r="26" fill="#fff" opacity=".1"/>` +
  // A stroked line with no fill of its own must not take SVG's default black fill.
  body.replace(/<path (?![^>]*\bfill=)/g, '<path fill="none" ') +
  `</svg>`;

/** A plate seen at an angle. */
const plate = (cx = 120, cy = 82, rx = 78, ry = 26) =>
  `<ellipse cx="${cx}" cy="${cy + 4}" rx="${rx}" ry="${ry}" fill="#000" opacity=".12"/>` +
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fbfaf7"/>` +
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx - 14}" ry="${ry - 8}" fill="#efebe3"/>`;

export const ILLUSTRATIONS: Record<string, string> = {
  grills: frame(
    ['#7a1f12', '#c2410c'],
    plate() +
      // rice
      `<ellipse cx="88" cy="78" rx="30" ry="12" fill="#f6efd9"/><g fill="#e9dcb4"><circle cx="78" cy="75" r="2"/><circle cx="92" cy="73" r="2"/><circle cx="98" cy="80" r="2"/><circle cx="84" cy="81" r="2"/></g>` +
      // kofta skewers
      `<g transform="rotate(-12 150 70)"><rect x="104" y="66" width="96" height="3" rx="1.5" fill="#9ca3af"/>` +
      `<rect x="112" y="58" width="22" height="18" rx="9" fill="#7c2d12"/><rect x="138" y="58" width="22" height="18" rx="9" fill="#92400e"/><rect x="164" y="58" width="22" height="18" rx="9" fill="#7c2d12"/>` +
      `<path d="M116 62h14M142 62h14M168 62h14" stroke="#451a03" stroke-width="2" opacity=".5"/></g>` +
      `<circle cx="160" cy="92" r="7" fill="#dc2626"/><circle cx="174" cy="90" r="6" fill="#16a34a"/>`,
  ),
  meatSandwiches: frame(
    ['#92400e', '#f59e0b'],
    `<ellipse cx="120" cy="104" rx="62" ry="8" fill="#000" opacity=".15"/>` +
      `<path d="M66 88h108a8 8 0 0 1-8 12H74a8 8 0 0 1-8-12z" fill="#d97706"/>` +
      `<rect x="62" y="74" width="116" height="14" rx="7" fill="#5b2a0e"/>` +
      `<path d="M60 72c10 6 20-4 30 2s20-4 30 2 20-4 30 2 20-4 30 2" stroke="#65a30d" stroke-width="6" fill="none" stroke-linecap="round"/>` +
      `<rect x="68" y="66" width="104" height="6" rx="3" fill="#facc15"/>` +
      `<path d="M66 64c0-24 24-38 54-38s54 14 54 38z" fill="#f59e0b"/>` +
      `<g fill="#fef3c7"><ellipse cx="98" cy="42" rx="3" ry="1.6"/><ellipse cx="120" cy="36" rx="3" ry="1.6"/><ellipse cx="142" cy="44" rx="3" ry="1.6"/><ellipse cx="110" cy="50" rx="3" ry="1.6"/><ellipse cx="132" cy="52" rx="3" ry="1.6"/></g>`,
  ),
  pasta: frame(
    ['#9a3412', '#fb923c'],
    `<ellipse cx="120" cy="100" rx="70" ry="10" fill="#000" opacity=".15"/>` +
      `<path d="M52 62h136c0 26-30 40-68 40S52 88 52 62z" fill="#fbfaf7"/><ellipse cx="120" cy="62" rx="68" ry="16" fill="#efebe3"/>` +
      `<ellipse cx="120" cy="60" rx="54" ry="11" fill="#fcd34d"/>` +
      `<path d="M74 60c8-8 16 6 24-2s16 6 24-2 16 6 24-2 12 4 16 2M80 64c8-6 16 4 24-2s16 4 24-2 16 4 24-2" stroke="#f59e0b" stroke-width="2.5" fill="none"/>` +
      `<ellipse cx="120" cy="56" rx="20" ry="6" fill="#dc2626"/><circle cx="112" cy="54" r="2.5" fill="#16a34a"/><circle cx="127" cy="53" r="2" fill="#16a34a"/>` +
      `<g transform="rotate(28 180 40)"><rect x="176" y="10" width="6" height="56" rx="3" fill="#d1d5db"/><path d="M172 8v14h14V8" stroke="#d1d5db" stroke-width="3" fill="none"/></g>`,
  ),
  pizza: frame(
    ['#b91c1c', '#f97316'],
    `<ellipse cx="120" cy="66" rx="84" ry="44" fill="#000" opacity=".12"/>` +
      `<ellipse cx="120" cy="62" rx="82" ry="42" fill="#d97706"/><ellipse cx="120" cy="62" rx="72" ry="35" fill="#facc15"/>` +
      `<path d="M120 62L48 62M120 62l50 26M120 62l50-26M120 62L80 30M120 62l-40 30" stroke="#d97706" stroke-width="2"/>` +
      `<g fill="#b91c1c"><circle cx="92" cy="50" r="8"/><circle cx="146" cy="48" r="8"/><circle cx="102" cy="78" r="8"/><circle cx="150" cy="74" r="8"/><circle cx="124" cy="62" r="7"/></g>` +
      `<g fill="#15803d"><ellipse cx="114" cy="44" rx="4" ry="2"/><ellipse cx="166" cy="62" rx="4" ry="2"/><ellipse cx="80" cy="66" rx="4" ry="2"/><ellipse cx="130" cy="84" rx="4" ry="2"/></g>` +
      `<g fill="#1f2937"><circle cx="134" cy="38" r="2.5"/><circle cx="88" cy="88" r="2.5"/><circle cx="168" cy="84" r="2.5"/></g>`,
  ),
  crepe: frame(
    ['#a16207', '#fbbf24'],
    plate(120, 86, 80, 22) +
      `<path d="M62 84c4-36 40-58 76-52 30 5 44 26 42 50z" fill="#f5c46b"/>` +
      `<path d="M62 84c22-10 70-14 118-2" stroke="#d99a2b" stroke-width="3" fill="none"/>` +
      `<path d="M74 70c14-6 30-6 44 0M92 52c14-6 30-4 44 4" stroke="#e7a940" stroke-width="2" fill="none"/>` +
      `<g fill="#b45309" opacity=".55"><circle cx="100" cy="62" r="2"/><circle cx="130" cy="48" r="2"/><circle cx="150" cy="66" r="2"/><circle cx="118" cy="74" r="2"/></g>` +
      `<path d="M150 82c6-6 12-8 20-6" stroke="#16a34a" stroke-width="4" stroke-linecap="round"/>`,
  ),
  sides: frame(
    ['#854d0e', '#eab308'],
    `<ellipse cx="78" cy="98" rx="44" ry="8" fill="#000" opacity=".15"/>` +
      `<path d="M38 62h80c0 22-18 34-40 34S38 84 38 62z" fill="#fbfaf7"/><ellipse cx="78" cy="62" rx="40" ry="11" fill="#f6efd9"/>` +
      `<g fill="#e9dcb4"><circle cx="66" cy="60" r="2"/><circle cx="80" cy="57" r="2"/><circle cx="92" cy="62" r="2"/><circle cx="74" cy="65" r="2"/></g>` +
      `<ellipse cx="166" cy="98" rx="42" ry="8" fill="#000" opacity=".15"/>` +
      `<path d="M126 60h80c0 22-18 34-40 34s-40-12-40-34z" fill="#c2410c"/><ellipse cx="166" cy="60" rx="40" ry="11" fill="#fdba74"/>` +
      `<path d="M150 58c6-3 10 3 16 0s10 3 16 0" stroke="#fff7ed" stroke-width="2" fill="none"/>` +
      `<path d="M154 40c-4-6 4-10 0-16M168 38c-4-6 4-10 0-16" stroke="#fff" stroke-width="2.5" opacity=".6" fill="none" stroke-linecap="round"/>`,
  ),
  feteer: frame(
    ['#78350f', '#d97706'],
    `<ellipse cx="120" cy="100" rx="84" ry="10" fill="#000" opacity=".15"/>` +
      `<path d="M44 52l76-26 76 26-76 34z" fill="#fde68a"/><path d="M44 52v14l76 34V86z" fill="#f59e0b"/><path d="M196 52v14l-76 34V86z" fill="#d97706"/>` +
      `<path d="M52 56l68 30M120 86l68-30M76 44l88 30M164 44l-88 30" stroke="#f59e0b" stroke-width="1.5" opacity=".7" fill="none"/>` +
      `<path d="M44 58l76 34 76-34M44 62l76 34 76-34" stroke="#fde68a" stroke-width="1" opacity=".8" fill="none"/>` +
      `<g fill="#b91c1c"><circle cx="104" cy="50" r="4"/><circle cx="134" cy="58" r="4"/><circle cx="118" cy="66" r="3.5"/></g><g fill="#15803d"><circle cx="126" cy="44" r="3"/><circle cx="146" cy="50" r="3"/><circle cx="96" cy="62" r="3"/></g>`,
  ),
  sweetFeteer: frame(
    ['#7c2d12', '#ea580c'],
    `<ellipse cx="120" cy="100" rx="84" ry="10" fill="#000" opacity=".15"/>` +
      `<path d="M44 52l76-26 76 26-76 34z" fill="#fef3c7"/><path d="M44 52v14l76 34V86z" fill="#fbbf24"/><path d="M196 52v14l-76 34V86z" fill="#f59e0b"/>` +
      `<path d="M70 46c16 6 30-4 46 4s30-2 44 6" stroke="#92400e" stroke-width="4" fill="none" stroke-linecap="round"/>` +
      `<path d="M78 58c14 4 26-4 40 2s26-2 40 4" stroke="#a16207" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>` +
      `<g fill="#fff"><circle cx="100" cy="40" r="2"/><circle cx="140" cy="44" r="2"/><circle cx="122" cy="70" r="2"/></g>`,
  ),
  drinks: frame(
    ['#0e7490', '#22d3ee'],
    `<ellipse cx="96" cy="106" rx="30" ry="6" fill="#000" opacity=".15"/>` +
      `<path d="M72 34h48l-6 70H78z" fill="#fff" opacity=".9"/><path d="M75 52h42l-4 50H79z" fill="#7f1d1d"/>` +
      `<g fill="#fff" opacity=".7"><circle cx="88" cy="70" r="2"/><circle cx="102" cy="82" r="1.6"/><circle cx="94" cy="92" r="1.8"/></g>` +
      `<path d="M104 34l14-22" stroke="#f43f5e" stroke-width="4" stroke-linecap="round"/>` +
      `<rect x="70" y="30" width="52" height="6" rx="3" fill="#e5e7eb"/>` +
      `<ellipse cx="160" cy="106" rx="22" ry="5" fill="#000" opacity=".15"/>` +
      `<path d="M150 104V58c0-8 4-12 4-20V26h12v12c0 8 4 12 4 20v46z" fill="#93c5fd" opacity=".9"/><rect x="153" y="20" width="14" height="8" rx="2" fill="#2563eb"/><rect x="150" y="66" width="20" height="16" fill="#2563eb"/>`,
  ),
  foul: frame(
    ['#713f12', '#ca8a04'],
    `<ellipse cx="120" cy="104" rx="62" ry="8" fill="#000" opacity=".15"/>` +
      `<path d="M66 58c0 30 22 46 54 46s54-16 54-46z" fill="#9a3412"/><path d="M78 40h84l12 18H66z" fill="#b45309"/>` +
      `<ellipse cx="120" cy="58" rx="54" ry="10" fill="#7c2d12"/><ellipse cx="120" cy="57" rx="46" ry="7" fill="#a16207"/>` +
      `<g fill="#78350f"><ellipse cx="104" cy="56" rx="4" ry="2.5"/><ellipse cx="118" cy="54" rx="4" ry="2.5"/><ellipse cx="134" cy="57" rx="4" ry="2.5"/><ellipse cx="146" cy="55" rx="4" ry="2.5"/><ellipse cx="94" cy="58" rx="4" ry="2.5"/></g>` +
      `<path d="M112 56c4-2 10-2 14 1" stroke="#facc15" stroke-width="2.5" stroke-linecap="round"/><circle cx="130" cy="54" r="2" fill="#16a34a"/>` +
      `<path d="M84 30c-4-6 4-10 0-16M120 28c-4-6 4-10 0-16M156 30c-4-6 4-10 0-16" stroke="#fff" stroke-width="2.5" opacity=".55" fill="none" stroke-linecap="round"/>`,
  ),
  falafel: frame(
    ['#14532d', '#65a30d'],
    plate(120, 84, 82, 24) +
      `<g><circle cx="86" cy="70" r="16" fill="#7c2d12"/><circle cx="82" cy="66" r="10" fill="#9a3412" opacity=".6"/></g>` +
      `<g><circle cx="120" cy="64" r="17" fill="#854d0e"/><circle cx="116" cy="59" r="10" fill="#a16207" opacity=".6"/></g>` +
      `<g><circle cx="154" cy="72" r="16" fill="#7c2d12"/><circle cx="150" cy="68" r="10" fill="#9a3412" opacity=".6"/></g>` +
      `<g fill="#facc15" opacity=".8"><circle cx="90" cy="62" r="1.5"/><circle cx="124" cy="56" r="1.5"/><circle cx="158" cy="64" r="1.5"/><circle cx="112" cy="70" r="1.5"/></g>` +
      `<g fill="#16a34a"><ellipse cx="102" cy="90" rx="8" ry="3"/><ellipse cx="140" cy="92" rx="8" ry="3"/></g><circle cx="122" cy="92" r="5" fill="#dc2626"/>`,
  ),
  potatoes: frame(
    ['#991b1b', '#ef4444'],
    `<ellipse cx="120" cy="106" rx="46" ry="7" fill="#000" opacity=".15"/>` +
      `<g fill="#facc15"><rect x="88" y="22" width="9" height="52" rx="3" transform="rotate(-10 92 48)"/><rect x="100" y="16" width="9" height="56" rx="3" transform="rotate(-4 104 44)"/><rect x="112" y="14" width="9" height="58" rx="3"/><rect x="124" y="16" width="9" height="56" rx="3" transform="rotate(5 128 44)"/><rect x="136" y="22" width="9" height="52" rx="3" transform="rotate(11 140 48)"/></g>` +
      `<g fill="#eab308"><rect x="106" y="26" width="8" height="40" rx="3" transform="rotate(-8 110 46)"/><rect x="128" y="26" width="8" height="40" rx="3" transform="rotate(8 132 46)"/></g>` +
      `<path d="M80 54h80l-10 52H90z" fill="#fff"/><path d="M80 54h80l-2 10H82z" fill="#fee2e2"/>` +
      `<path d="M104 78c4 8 28 8 32 0" stroke="#dc2626" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  ),
  eggs: frame(
    ['#1e3a8a', '#3b82f6'],
    `<ellipse cx="112" cy="98" rx="66" ry="10" fill="#000" opacity=".18"/>` +
      `<circle cx="112" cy="64" r="44" fill="#1f2937"/><circle cx="112" cy="64" r="38" fill="#374151"/>` +
      `<rect x="154" y="58" width="62" height="12" rx="6" fill="#111827"/>` +
      `<path d="M86 50c10-14 34-12 44 2 12 2 16 16 8 24-8 12-30 14-44 6-14-2-18-20-8-32z" fill="#fff"/>` +
      `<circle cx="110" cy="62" r="12" fill="#f59e0b"/><circle cx="106" cy="58" r="4" fill="#fde68a" opacity=".8"/>` +
      `<g fill="#16a34a"><circle cx="132" cy="70" r="2"/><circle cx="96" cy="74" r="2"/></g>`,
  ),
  assorted: frame(
    ['#4c1d95', '#8b5cf6'],
    plate(120, 84, 80, 24) +
      `<g transform="rotate(-18 92 66)"><ellipse cx="92" cy="66" rx="26" ry="14" fill="#581c87"/><ellipse cx="92" cy="66" rx="20" ry="9" fill="#e9d5a5"/><g fill="#a16207" opacity=".5"><circle cx="86" cy="64" r="1.5"/><circle cx="96" cy="68" r="1.5"/><circle cx="92" cy="62" r="1.5"/></g></g>` +
      `<g transform="rotate(12 146 68)"><ellipse cx="146" cy="68" rx="26" ry="14" fill="#581c87"/><ellipse cx="146" cy="68" rx="20" ry="9" fill="#d6b77a"/><g fill="#92400e" opacity=".5"><circle cx="140" cy="66" r="1.5"/><circle cx="150" cy="70" r="1.5"/></g></g>` +
      `<path d="M112 46c4-8 12-10 18-8" stroke="#15803d" stroke-width="4" stroke-linecap="round"/><circle cx="120" cy="88" r="6" fill="#dc2626"/>`,
  ),
  mixes: frame(
    ['#0f766e', '#2dd4bf'],
    `<ellipse cx="120" cy="104" rx="70" ry="8" fill="#000" opacity=".15"/>` +
      `<path d="M50 74c0-10 30-16 70-16s70 6 70 16v10c0 8-30 14-70 14s-70-6-70-14z" fill="#e7b46a"/>` +
      `<path d="M52 70c12-6 22 6 34 0s22 6 34 0 22 6 34 0 22 6 34 0" stroke="#16a34a" stroke-width="6" fill="none" stroke-linecap="round"/>` +
      `<rect x="56" y="58" width="128" height="8" rx="4" fill="#7c2d12"/><rect x="60" y="50" width="120" height="8" rx="4" fill="#fde047"/>` +
      `<g fill="#dc2626"><rect x="70" y="44" width="20" height="6" rx="3"/><rect x="110" y="44" width="20" height="6" rx="3"/><rect x="150" y="44" width="20" height="6" rx="3"/></g>` +
      `<path d="M50 44c0-14 30-22 70-22s70 8 70 22z" fill="#f3c27a"/><g fill="#fff7ed"><ellipse cx="100" cy="32" rx="3" ry="1.5"/><ellipse cx="128" cy="30" rx="3" ry="1.5"/><ellipse cx="150" cy="36" rx="3" ry="1.5"/></g>`,
  ),
  salads: frame(
    ['#166534', '#4ade80'],
    `<ellipse cx="120" cy="104" rx="64" ry="8" fill="#000" opacity=".15"/>` +
      `<path d="M58 60h124c0 26-28 42-62 42S58 86 58 60z" fill="#fbfaf7"/>` +
      `<g fill="#22c55e"><ellipse cx="86" cy="56" rx="22" ry="12"/><ellipse cx="150" cy="56" rx="22" ry="12"/></g><ellipse cx="118" cy="50" rx="26" ry="14" fill="#16a34a"/>` +
      `<g fill="#dc2626"><circle cx="98" cy="48" r="8"/><circle cx="140" cy="46" r="8"/><circle cx="120" cy="58" r="7"/></g>` +
      `<g fill="#fef08a"><circle cx="98" cy="48" r="3"/><circle cx="140" cy="46" r="3"/></g><g fill="#a3e635"><circle cx="80" cy="52" r="6"/><circle cx="160" cy="54" r="6"/></g>`,
  ),
  fino: frame(
    ['#9a3412', '#fdba74'],
    `<ellipse cx="120" cy="100" rx="86" ry="8" fill="#000" opacity=".15"/>` +
      `<g transform="rotate(-6 120 70)"><rect x="34" y="52" width="172" height="40" rx="20" fill="#f2b45a"/><rect x="34" y="52" width="172" height="20" rx="10" fill="#f7c879"/>` +
      `<path d="M66 58l10 12M96 56l10 12M126 56l10 12M156 58l10 12" stroke="#c27a22" stroke-width="3" stroke-linecap="round"/>` +
      `<path d="M40 76c40 6 120 6 160 0" stroke="#7c2d12" stroke-width="3" fill="none" opacity=".35"/></g>` +
      `<path d="M150 38c6-6 14-8 22-6" stroke="#16a34a" stroke-width="4" stroke-linecap="round"/>`,
  ),
  cheese: frame(
    ['#a16207', '#fde047'],
    `<ellipse cx="120" cy="100" rx="70" ry="8" fill="#000" opacity=".15"/>` +
      `<path d="M58 66l92-40 40 22v44H58z" fill="#fbbf24"/><path d="M58 66h132v26H58z" fill="#f59e0b"/><path d="M58 66l92-40 40 22z" fill="#fde68a"/>` +
      `<g fill="#d97706"><circle cx="82" cy="78" r="6"/><circle cx="120" cy="84" r="4"/><circle cx="160" cy="76" r="7"/><circle cx="104" cy="60" r="4" opacity=".6"/><circle cx="146" cy="50" r="5" opacity=".6"/></g>`,
  ),
  rolls: frame(
    ['#7f1d1d', '#f87171'],
    `<ellipse cx="120" cy="102" rx="80" ry="8" fill="#000" opacity=".15"/>` +
      `<g transform="rotate(-14 120 66)"><rect x="40" y="48" width="150" height="38" rx="19" fill="#f3d9a4"/>` +
      `<ellipse cx="190" cy="67" rx="14" ry="19" fill="#e9c98a"/><ellipse cx="190" cy="67" rx="10" ry="14" fill="#facc15"/>` +
      `<g fill="#16a34a"><circle cx="186" cy="60" r="3"/><circle cx="192" cy="72" r="3"/></g><circle cx="190" cy="66" r="3" fill="#dc2626"/>` +
      `<path d="M70 52l-8 30M100 50l-8 34M130 50l-8 34M160 52l-8 32" stroke="#d6b06a" stroke-width="2"/></g>` +
      `<g fill="#7c2d12" opacity=".5"><circle cx="80" cy="76" r="2"/><circle cx="118" cy="68" r="2"/><circle cx="150" cy="58" r="2"/></g>`,
  ),
  boxes: frame(
    ['#334155', '#64748b'],
    `<ellipse cx="120" cy="104" rx="70" ry="8" fill="#000" opacity=".2"/>` +
      `<path d="M56 54h128l-8 48H64z" fill="#f8fafc"/><path d="M56 54h128v8H56z" fill="#e2e8f0"/>` +
      `<path d="M52 50h136v6H52z" fill="#cbd5e1"/><ellipse cx="120" cy="52" rx="58" ry="5" fill="#a16207"/>` +
      `<g fill="#78350f"><ellipse cx="96" cy="51" rx="4" ry="2"/><ellipse cx="114" cy="50" rx="4" ry="2"/><ellipse cx="132" cy="52" rx="4" ry="2"/><ellipse cx="148" cy="50" rx="4" ry="2"/></g>` +
      `<rect x="96" y="70" width="48" height="18" rx="9" fill="#dc2626"/><path d="M108 79h24" stroke="#fff" stroke-width="3" stroke-linecap="round"/>` +
      `<path d="M98 40c-4-6 4-10 0-16M120 38c-4-6 4-10 0-16M142 40c-4-6 4-10 0-16" stroke="#fff" stroke-width="2.5" opacity=".5" fill="none" stroke-linecap="round"/>`,
  ),
};

/** The picture as a data URL, ready for `categories.image`. */
export const illustration = (key: string) => {
  const svg = ILLUSTRATIONS[key];
  if (!svg) throw new Error(`No illustration "${key}"`);
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
};
