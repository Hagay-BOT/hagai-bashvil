// The Hagai character. One function, returns an SVG string. Hand-drawn in code, no external assets.
// opts: { hat, glasses, shirt: 'beige'|'black', walk }
function hagaiSVG(opts) {
  const o = Object.assign({ hat: true, glasses: false, shirt: 'beige', walk: true }, opts);
  const C = {
    skin: '#d9a47e', skinD: '#c08a66', skinL: '#e6b792', lip: '#9a5246',
    hair: '#2a1a14', hairL: '#4b3125', beard: '#3a251b',
    shirt: o.shirt === 'black' ? '#2a2d31' : '#d9d2c1', shirtD: o.shirt === 'black' ? '#1b1d20' : '#bdb49f', shirtL: o.shirt === 'black' ? '#3a3e44' : '#e8e2d4',
    pant: '#5c676c', pantD: '#48535a', pantL: '#6c787d',
    pack: '#33493e', packD: '#243529', packL: '#446052', strap: '#1c2a23',
    hat: '#d8ccac', hatD: '#b7a984', hatL: '#e8dfc6',
    shoe: '#7d8083', shoeD: '#55585b', sole: '#2e3133', red: '#c5302b', redD: '#8f1f1c', metal: '#b9bec4', grip: '#26282b',
  };
  const curl = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.hair}"/><path d="M${x - r * .55} ${y - r * .1} a${r * .55} ${r * .55} 0 0 1 ${r * .8} -${r * .5}" fill="none" stroke="${C.hairL}" stroke-width="1.6" stroke-linecap="round"/>`;
  const curlsTop = [[119, 70, 10], [121, 58, 11], [129, 47, 12], [141, 40, 12], [154, 38, 12], [167, 41, 12], [178, 49, 11], [183, 60, 10], [184, 71, 9], [136, 53, 10], [149, 50, 10], [162, 52, 10], [172, 58, 9], [128, 61, 9], [143, 60, 8], [158, 60, 8]].map(c => curl(...c)).join('');
  const curlsSide = (o.hat ? [[117, 74, 8], [115, 83, 6.5], [184, 74, 8], [186, 82, 6], [124, 68, 7], [176, 68, 7]] : [[117, 74, 8], [115, 83, 6.5], [184, 74, 8], [186, 82, 6]]).map(c => curl(...c)).join('');
  const hat = `
    <path d="M86 60 Q90 46 150 45 Q210 46 214 60 Q212 72 150 73 Q88 72 86 60Z" fill="${C.hatD}"/>
    <path d="M86 58 Q92 43 150 42 Q208 43 214 58 Q205 67 150 68 Q95 67 86 58Z" fill="${C.hat}"/>
    <path d="M113 56 Q111 20 150 17 Q189 20 187 56 Q170 62 150 62 Q130 62 113 56Z" fill="${C.hat}"/>
    <path d="M150 17 Q189 20 187 56 Q178 59.500 168 61 Q176 36 150 17Z" fill="${C.hatD}" opacity=".55"/>
    <path d="M122 30 Q132 21 146 20" fill="none" stroke="${C.hatL}" stroke-width="4" stroke-linecap="round" opacity=".8"/>
    <path d="M113 50 Q150 60 187 50 L187 56 Q150 66 113 56Z" fill="#8d7f5c"/>
    <path d="M92 58 Q150 66 208 58" fill="none" stroke="${C.hatD}" stroke-width="1.2" stroke-dasharray="3 3" opacity=".7"/>
    <path d="M122 68 Q132 110 150 140 M178 68 Q168 110 150 140" fill="none" stroke="#6f6448" stroke-width="1.6"/>
    <rect x="146.500" y="136" width="7" height="9" rx="2" fill="#4a432f"/>`;
  const eyes = `
    <path d="M128 78 Q136 72.500 144 78 Q136 81.500 128 78Z" fill="#fff"/><path d="M156 78 Q164 72.500 172 78 Q164 81.500 156 78Z" fill="#fff"/>
    <circle cx="136" cy="77.300" r="3.300" fill="#3b2418"/><circle cx="164" cy="77.300" r="3.300" fill="#3b2418"/>
    <circle cx="137" cy="76.300" r="1" fill="#fff"/><circle cx="165" cy="76.300" r="1" fill="#fff"/>
    <path d="M127.500 77.500 Q136 71.500 144.500 77.500" fill="none" stroke="${C.hair}" stroke-width="1.8" stroke-linecap="round"/><path d="M155.500 77.500 Q164 71.500 172.500 77.500" fill="none" stroke="${C.hair}" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M130 82.500 Q136 84.500 142 82.500 M158 82.500 Q164 84.500 170 82.500" fill="none" stroke="${C.skinD}" stroke-width="1.3" stroke-linecap="round"/>`;
  const glasses = `
    <path d="M120 77 L124 74 M180 77 L176 74" stroke="#17181a" stroke-width="3" stroke-linecap="round"/>
    <path d="M123 71.500 Q136 68.500 148 71.500 Q150 73 152 71.500 Q164 68.500 177 71.500 Q179 80 170 85 Q160 87 153.500 79 Q150 77 146.500 79 Q140 87 130 85 Q121 80 123 71.500Z" fill="url(#lens)" stroke="#17181a" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M128 75 Q134 72.500 141 74" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".7"/><path d="M158 75 Q164 72.500 171 74" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".7"/>`;
  return `<svg viewBox="40 6 220 444" xmlns="http://www.w3.org/2000/svg" class="hagai${o.walk ? ' walking' : ''}" aria-hidden="true">
  <defs>
    <linearGradient id="lens" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#ffd84a"/><stop offset=".55" stop-color="#f58a2a"/><stop offset="1" stop-color="#d9431e"/></linearGradient>
    <pattern id="stubble" width="3.400" height="3.400" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><circle cx="1" cy="1" r=".62" fill="${C.hair}" opacity=".75"/></pattern>
    <linearGradient id="poleG" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${C.red}"/><stop offset=".62" stop-color="${C.red}"/><stop offset=".63" stop-color="${C.metal}"/><stop offset="1" stop-color="#8f959b"/></linearGradient>
  </defs>
  <ellipse cx="150" cy="441" rx="74" ry="7" fill="#000" opacity=".18"/>

  <!-- poles (behind the body) -->
  <g class="pole-l"><path d="M95 232 L68 436" stroke="url(#poleG)" stroke-width="4.200" stroke-linecap="round"/><path d="M62 430 h12" stroke="${C.grip}" stroke-width="3" stroke-linecap="round"/></g>
  <g class="pole-r"><path d="M205 232 L232 436" stroke="url(#poleG)" stroke-width="4.200" stroke-linecap="round"/><path d="M226 430 h12" stroke="${C.grip}" stroke-width="3" stroke-linecap="round"/></g>

  <!-- back leg -->
  <g class="leg-b">
    <path d="M152 246 L188 246 Q190 292 185 330 Q184 370 181 410 L158 410 Q157 370 156 330 Q151 292 152 246Z" fill="${C.pantD}"/>
    <path d="M155 408 L183 408 Q190 420 189 433 L150 433 Q148 420 155 408Z" fill="${C.shoeD}"/><rect x="147" y="431" width="44" height="7" rx="3.500" fill="${C.sole}"/>
  </g>
  <!-- front leg -->
  <g class="leg-f">
    <path d="M112 246 L151 246 Q152 292 147 332 Q146 372 144 414 L119 414 Q117 372 114 332 Q109 292 112 246Z" fill="${C.pant}"/>
    <path d="M131 262 Q134 300 130 330 Q130 372 129 414 L119 414 Q117 372 114 332 Q109 292 112 250Z" fill="${C.pantL}" opacity=".5"/>
    <path d="M116 330 Q130 336 146 330" fill="none" stroke="${C.pantD}" stroke-width="2" stroke-linecap="round" opacity=".7"/>
    <path d="M139 268 l9 4 l-1 18 l-9 -3Z" fill="${C.pantD}" opacity=".55"/>
    <path d="M116 411 L146 411 Q154 424 153 436 L109 436 Q107 424 116 411Z" fill="${C.shoe}"/>
    <path d="M120 416 l20 0 M119 421 l22 0 M119 426 l23 0" stroke="#e9eaeb" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M109 428 Q131 424 153 428 L153 436 L109 436Z" fill="${C.shoeD}"/><rect x="106" y="434" width="50" height="7.500" rx="3.700" fill="${C.sole}"/>
    <path d="M146 411 q5 -3 4 -8" fill="none" stroke="${C.shoeD}" stroke-width="3" stroke-linecap="round"/>
  </g>

  <g class="upper">
    <!-- backpack -->
    <path d="M108 96 Q150 84 192 96 Q200 104 198 124 L102 124 Q100 104 108 96Z" fill="${C.pack}"/>
    <path d="M150 88 Q178 88 192 96 Q200 104 198 124 L172 124 Q176 100 150 88Z" fill="${C.packD}" opacity=".6"/>
    <path d="M94 126 Q150 112 206 126 Q214 190 206 250 Q150 262 94 250 Q86 190 94 126Z" fill="${C.pack}"/>
    <path d="M176 120 Q206 124 206 126 Q214 190 206 250 Q192 254 180 255 Q190 190 176 120Z" fill="${C.packD}" opacity=".65"/>
    <path d="M88 170 Q82 200 90 232 L100 232 L100 170Z" fill="${C.packD}"/><path d="M212 170 Q218 200 210 232 L200 232 L200 170Z" fill="${C.packD}"/>

    <!-- torso -->
    <path d="M106 134 Q126 122 150 124 Q174 122 194 134 Q202 170 198 210 L196 252 Q150 260 104 252 L102 210 Q98 170 106 134Z" fill="${C.shirt}"/>
    <path d="M168 124 Q184 126 194 134 Q202 170 198 210 L196 252 Q184 255 172 256 Q182 190 168 124Z" fill="${C.shirtD}" opacity=".55"/>
    <path d="M112 150 Q118 200 114 250" fill="none" stroke="${C.shirtL}" stroke-width="5" stroke-linecap="round" opacity=".7"/>
    <path d="M128 212 Q150 220 172 212 M124 228 Q150 238 176 228" fill="none" stroke="${C.shirtD}" stroke-width="1.8" stroke-linecap="round" opacity=".6"/>
    <!-- neck -->
    <path d="M138 104 L162 104 L164 128 Q150 140 136 128Z" fill="${C.skinD}"/>
    <path d="M134 126 Q150 142 166 126" fill="none" stroke="${C.shirtD}" stroke-width="4" stroke-linecap="round"/>
    <path d="M140 132 Q150 152 160 132" fill="none" stroke="#cfd3d6" stroke-width="1.200" opacity=".9"/>

    <!-- straps -->
    <path d="M122 126 Q116 180 118 240 L130 240 Q128 180 134 126Z" fill="${C.strap}"/><path d="M178 126 Q184 180 182 240 L170 240 Q172 180 166 126Z" fill="${C.strap}"/>
    <path d="M124 150 l8 0 M124 200 l7 0 M168 150 l8 0 M169 200 l7 0" stroke="${C.packL}" stroke-width="2"/>
    <rect x="124" y="172" width="52" height="5" rx="2" fill="${C.strap}"/><rect x="144" y="169.500" width="12" height="10" rx="2.500" fill="#3c4a43"/>
    <path d="M100 236 Q150 248 200 236 L201 254 Q150 266 99 254Z" fill="${C.packD}"/><rect x="141" y="240" width="18" height="15" rx="3" fill="#3c4a43"/><rect x="146" y="244" width="8" height="7" rx="1.500" fill="${C.strap}"/>
    <path d="M186 206 q10 4 8 16" fill="none" stroke="#e36a2e" stroke-width="3" stroke-linecap="round"/><circle cx="194" cy="224" r="4" fill="#e36a2e"/>

    <!-- arms -->
    <g class="arm-l">
      <path d="M110 140 Q92 150 86 196" fill="none" stroke="${C.shirt}" stroke-width="27" stroke-linecap="round"/>
      <path d="M118 150 Q104 160 98 196" fill="none" stroke="${C.shirtD}" stroke-width="6" stroke-linecap="round" opacity=".45"/>
      <path d="M86 198 Q86 220 94 236" fill="none" stroke="${C.skin}" stroke-width="17" stroke-linecap="round"/>
      <path d="M74 196 Q86 204 98 196" fill="none" stroke="${C.shirtD}" stroke-width="5" stroke-linecap="round"/>
      <rect x="88" y="214" width="12" height="30" rx="5" fill="${C.grip}" transform="rotate(7 94 229)"/><path d="M95 214 q9 10 4 26" fill="none" stroke="${C.red}" stroke-width="2.500"/>
      <path d="M84 232 q10 -7 20 0 q3 9 -4 15 q-9 4 -15 -3 q-4 -6 -1 -12Z" fill="${C.skin}"/><path d="M88 236 h13 M88 240.500 h13 M89 245 h11" stroke="${C.skinD}" stroke-width="1.300" stroke-linecap="round"/>
    </g>
    <g class="arm-r">
      <path d="M190 140 Q208 150 214 196" fill="none" stroke="${C.shirtD}" stroke-width="27" stroke-linecap="round"/>
      <path d="M214 198 Q214 220 206 236" fill="none" stroke="${C.skinD}" stroke-width="17" stroke-linecap="round"/>
      <path d="M202 196 Q214 204 226 196" fill="none" stroke="${C.shirtD}" stroke-width="5" stroke-linecap="round"/>
      <rect x="204" y="218" width="19" height="9" rx="2.500" fill="#17191b" transform="rotate(-14 213 222)"/><rect x="208" y="216" width="10" height="12" rx="3" fill="#2b2e31" transform="rotate(-14 213 222)"/>
      <rect x="200" y="214" width="12" height="30" rx="5" fill="${C.grip}" transform="rotate(-7 206 229)"/><path d="M205 214 q-9 10 -4 26" fill="none" stroke="${C.red}" stroke-width="2.500"/>
      <path d="M216 232 q-10 -7 -20 0 q-3 9 4 15 q9 4 15 -3 q4 -6 1 -12Z" fill="${C.skinD}"/><path d="M199 236 h13 M199 240.500 h13 M200 245 h11" stroke="#a9744f" stroke-width="1.300" stroke-linecap="round"/>
    </g>

    <!-- head -->
    <g class="head">
      ${o.hat ? '' : curlsTop}
      <ellipse cx="116.500" cy="84" rx="6" ry="9.500" fill="${C.skin}"/><ellipse cx="183.500" cy="84" rx="6" ry="9.500" fill="${C.skinD}"/>
      <path d="M115 82 q2.500 2 2 6" fill="none" stroke="${C.skinD}" stroke-width="1.400"/>
      <path d="M119 70 Q119 44 150 44 Q181 44 181 70 L181 86 Q179 106 166 115 Q150 123 134 115 Q121 106 119 86Z" fill="${C.skin}"/>
      <path d="M162 46 Q181 50 181 70 L181 86 Q179 106 166 115 Q160 118 154 119.500 Q172 104 170 76 Q170 56 162 46Z" fill="${C.skinD}" opacity=".5"/>
      <ellipse cx="131" cy="90" rx="6" ry="3.500" fill="#e58e7c" opacity=".35"/><ellipse cx="169" cy="90" rx="6" ry="3.500" fill="#e58e7c" opacity=".3"/>
      <!-- stubble -->
      <path d="M119 82 Q121 106 134 115 Q150 123 166 115 Q179 106 181 82 Q178 93 169 96 Q160 90.500 150 92 Q140 90.500 131 96 Q122 93 119 82Z" fill="${C.beard}" opacity=".3"/>
      <path d="M119 82 Q121 106 134 115 Q150 123 166 115 Q179 106 181 82 Q178 93 169 96 Q160 90.500 150 92 Q140 90.500 131 96 Q122 93 119 82Z" fill="url(#stubble)"/>
      <path d="M136 95.500 Q143 90 150 92.300 Q157 90 164 95.500 Q157 97.300 150 95.800 Q143 97.300 136 95.500Z" fill="${C.beard}" opacity=".62"/>
      <!-- smile -->
      <path d="M138 98.500 Q150 112 162 98.500 Q150 102 138 98.500Z" fill="#7c3a33"/>
      <path d="M139.500 99.300 Q150 102.600 160.500 99.300 Q158 104 150 104.500 Q142 104 139.500 99.300Z" fill="#fff"/>
      <!-- nose -->
      <path d="M150 74 Q146 86 147.500 90.500 Q150 92.500 153.500 90.500" fill="none" stroke="${C.skinD}" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M152.500 76 Q154.500 84 153.500 88.500" fill="none" stroke="${C.skinL}" stroke-width="1.800" stroke-linecap="round" opacity=".8"/>
      <!-- brows -->
      <path d="M126.500 69.500 Q135 63.500 145 68" fill="none" stroke="${C.hair}" stroke-width="4.200" stroke-linecap="round"/><path d="M155 68 Q165 63.500 173.500 69.500" fill="none" stroke="${C.hair}" stroke-width="4.200" stroke-linecap="round"/>
      ${o.glasses ? glasses : eyes}
      <!-- earring, his left ear -->
      <circle cx="185" cy="94" r="3" fill="none" stroke="#c3c8ce" stroke-width="1.700"/>
      ${curlsSide}
      ${o.hat ? hat : ''}
    </g>
  </g>
</svg>`;
}
if (typeof module !== 'undefined') module.exports = { hagaiSVG };
