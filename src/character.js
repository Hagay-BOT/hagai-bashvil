// The Hagai character. One function, returns an SVG string. Hand-drawn in code, no external assets.
// opts: { hat, glasses, shirt: 'beige'|'black', walk }
function hagaiSVG(opts) {
  const o = Object.assign({ hat: true, glasses: false, shirt: 'beige', walk: true, pose: 'walk', sleep: false }, opts);
  const sit = o.pose === 'coffee';
  const brew = sit && o.variant !== 'sip';
  const coffee = false;
  const C = {
    skin: '#d9a47e', skinD: '#c08a66', skinL: '#e6b792', lip: '#9a5246',
    hair: '#2a1a14', hairL: '#4b3125', beard: '#3a251b',
    shirt: o.shirt === 'black' ? '#2a2d31' : '#d9d2c1', shirtD: o.shirt === 'black' ? '#1b1d20' : '#bdb49f', shirtL: o.shirt === 'black' ? '#3a3e44' : '#e8e2d4',
    pant: '#5c676c', pantD: '#48535a', pantL: '#6c787d',
    pack: '#33493e', packD: '#243529', packL: '#446052', strap: '#1c2a23',
    hat: '#6f7d4c', hatD: '#56623a', hatL: '#8d9b68',
    shoe: '#7d8083', shoeD: '#55585b', sole: '#2e3133', red: '#c5302b', redD: '#8f1f1c', metal: '#b9bec4', grip: '#26282b',
  };
  const curl = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.hair}"/><path d="M${x - r * .55} ${y - r * .1} a${r * .55} ${r * .55} 0 0 1 ${r * .8} -${r * .5}" fill="none" stroke="${C.hairL}" stroke-width="1.6" stroke-linecap="round"/>`;
  const hl = d => `<path d="${d}" fill="none" stroke="${C.hairL}" stroke-width="1.700" stroke-linecap="round"/>`;
  // volume behind the head: wavy, a little messy, not too tall
  const hairBack = `<path d="M121 68 Q115 58 119.500 48 Q118 38 128 35 Q133 27 145 29 Q153 23 162 28 Q174 26 178 35 Q186 40 182 49 Q186 58 179 68 L177 54 L123 54Z" fill="${C.hair}"/>`;
  // the hairline: loose curls falling on the forehead
  const fringe = `<path d="M121 66 Q118 53 126 47 Q125 39 135 38 Q141 31 150 35 Q159 30 166 36 Q176 36 176 44 Q182 51 179 66 Q176 56 169 56 Q170 49 163 48 Q160 53 154 50.500 Q149 46 143 49.500 Q137 47 133 53 Q126 54 121 66Z" fill="${C.hair}"/>
      <path d="M133 41 Q129 34 133 29 Q135 35 139 38Z M160 34 Q163 27 170 26 Q166 31 166 36Z" fill="${C.hair}"/>`
    + hl('M128 43 q4 -6 11 -6') + hl('M146 35 q6 -4 12 -2') + hl('M163 41 q7 -2 10 3') + hl('M135 49 q5 -4 10 -2') + hl('M156 47 q5 -2 8 2');
  const sides = `<path d="M120.500 58 Q116 68 119 80 L123.500 70Z" fill="${C.hair}"/><path d="M179.500 58 Q184 68 181 80 L176.500 70Z" fill="${C.hair}"/>`;
  // the mullet: longer hair behind the ears, down to the collar
  const mullet = `<path d="M119 64 Q113.500 76 115 88 Q114.500 96 118.500 101 Q121.500 98 124 101.500 Q127.500 99 131 100.500 L132 88 L168 88 L169 100.500 Q172.500 99 176 101.500 Q178.500 98 181.500 101 Q185.500 96 185 88 Q186.500 76 181 64Z" fill="${C.hair}"/>`
    + hl('M117.500 90 q1 5 4 8') + hl('M182.500 90 q-1 5 -4 8');
  const underHat = `<path d="M120 66 Q114 74 118.500 84 L124 74Z" fill="${C.hair}"/><path d="M180 66 Q186 74 181.500 84 L176 74Z" fill="${C.hair}"/><path d="M124 72 Q130 66 138 71 Q131 70 127 76Z" fill="${C.hair}"/><path d="M176 72 Q170 66 162 71 Q169 70 173 76Z" fill="${C.hair}"/>`;
  const hat = `
    <path d="M86 60 Q90 46 150 45 Q210 46 214 60 Q212 72 150 73 Q88 72 86 60Z" fill="${C.hatD}"/>
    <path d="M86 58 Q92 43 150 42 Q208 43 214 58 Q205 67 150 68 Q95 67 86 58Z" fill="${C.hat}"/>
    <path d="M113 56 Q111 20 150 17 Q189 20 187 56 Q170 62 150 62 Q130 62 113 56Z" fill="${C.hat}"/>
    <path d="M150 17 Q189 20 187 56 Q178 59.500 168 61 Q176 36 150 17Z" fill="${C.hatD}" opacity=".55"/>
    <path d="M122 30 Q132 21 146 20" fill="none" stroke="${C.hatL}" stroke-width="4" stroke-linecap="round" opacity=".8"/>
    <path d="M113 50 Q150 60 187 50 L187 56 Q150 66 113 56Z" fill="#454d31"/>
    <path d="M92 58 Q150 66 208 58" fill="none" stroke="${C.hatD}" stroke-width="1.2" stroke-dasharray="3 3" opacity=".7"/>
    <path d="M122 68 Q132 110 150 140 M178 68 Q168 110 150 140" fill="none" stroke="#3f4630" stroke-width="1.6"/>
    <rect x="146.500" y="136" width="7" height="9" rx="2" fill="#30361f"/>
    <rect x="141" y="31" width="18" height="12" rx="2.500" fill="#ebe6d6" stroke="#3f4830" stroke-width="1"/><path d="M150 33.500 l3.500 3.500 l-3.500 3.500 l-3.500 -3.500Z" fill="#3f4830"/>`;
  const closedEyes = `<path d="M129 78 Q136 82.500 143 78 M157 78 Q164 82.500 171 78" fill="none" stroke="${C.hair}" stroke-width="2.200" stroke-linecap="round"/><path d="M127.500 71 Q135 68 144.500 70.500 M155.500 70.500 Q165 68 172.500 71" fill="none" stroke="${C.hair}" stroke-width="3.500" stroke-linecap="round"/>`;
  const eyes = `
    <path d="M128 78 Q136 72.500 144 78 Q136 81.500 128 78Z" fill="#fff"/><path d="M156 78 Q164 72.500 172 78 Q164 81.500 156 78Z" fill="#fff"/>
    <circle cx="136" cy="77.300" r="3.300" fill="#3b2418"/><circle cx="164" cy="77.300" r="3.300" fill="#3b2418"/>
    <circle cx="137" cy="76.300" r="1" fill="#fff"/><circle cx="165" cy="76.300" r="1" fill="#fff"/>
    <path d="M127.500 77.500 Q136 71.500 144.500 77.500" fill="none" stroke="${C.hair}" stroke-width="1.8" stroke-linecap="round"/><path d="M155.500 77.500 Q164 71.500 172.500 77.500" fill="none" stroke="${C.hair}" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M130 82.500 Q136 84.500 142 82.500 M158 82.500 Q164 84.500 170 82.500" fill="none" stroke="${C.skinD}" stroke-width="1.3" stroke-linecap="round"/>`;
  const glasses = `
    <path d="M117 74 L124 72 M183 74 L176 72" stroke="#141516" stroke-width="3.200" stroke-linecap="round"/>
    <path d="M121 70 Q150 62 179 70 Q181 78 175 84 Q166 88 157 83 Q153 79.500 150 79.500 Q147 79.500 143 83 Q134 88 125 84 Q119 78 121 70Z" fill="url(#lens)"/>
    <path d="M121 70 Q150 62 179 70" fill="none" stroke="#141516" stroke-width="3" stroke-linecap="round"/>
    <path d="M147 69 Q150 76 153 69" fill="none" stroke="#141516" stroke-width="2.400"/>
    <path d="M127 73 Q136 69 146 71" fill="none" stroke="#fff" stroke-width="1.600" stroke-linecap="round" opacity=".55"/>`;
  return `<svg viewBox="40 6 220 444" xmlns="http://www.w3.org/2000/svg" class="hagai${o.walk ? ' walking' : ''}" aria-hidden="true">
  <defs>
    <linearGradient id="lens" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#ffb02e"/><stop offset=".35" stop-color="#e8402a"/><stop offset=".7" stop-color="#b0247a"/><stop offset="1" stop-color="#5a2a8a"/></linearGradient>
    <pattern id="stubble" width="2.300" height="2.300" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><circle cx=".8" cy=".8" r=".42" fill="${C.hair}" opacity=".55"/></pattern>
    <linearGradient id="poleG" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${C.red}"/><stop offset=".62" stop-color="${C.red}"/><stop offset=".63" stop-color="${C.metal}"/><stop offset="1" stop-color="#8f959b"/></linearGradient>
  </defs>
  <ellipse cx="150" cy="441" rx="74" ry="7" fill="#000" opacity=".18"/>
  ${sit ? `<path d="M74 441 Q66 384 106 364 Q150 346 198 362 Q236 378 228 441Z" fill="#9aa0a3"/><path d="M92 372 Q130 352 176 356" fill="none" stroke="#c3c8cb" stroke-width="6" stroke-linecap="round"/>
    <path d="M60 300 L118 441 M68 296 L124 441" stroke="url(#poleG)" stroke-width="4" stroke-linecap="round"/>
    <g class="stove"><ellipse cx="240" cy="441" rx="22" ry="4" fill="#000" opacity=".2"/><rect x="230" y="418" width="20" height="22" rx="5" fill="#d9dde1"/><rect x="230" y="424" width="20" height="7" fill="#e2572b"/>
      <path d="M228 418 h24 M232 418 l-4 -6 M248 418 l4 -6" stroke="#6b7076" stroke-width="2.400" stroke-linecap="round"/><path class="flame" d="M236 412 q4 -9 4 -2 q3 -8 4 2 q-4 3 -8 0Z" fill="#ffb02e"/>
      <path d="M228 378 L252 378 L249 384 Q258 398 250 410 L230 410 Q222 398 231 384Z" fill="#c8793a"/><path d="M226 377 h28" stroke="#e7a56a" stroke-width="3" stroke-linecap="round"/><path d="M231 392 q9 4 18 0" fill="none" stroke="#a65e28" stroke-width="2"/>
      ${brew ? '<path d="M228 386 L206 330" stroke="#3b2a1e" stroke-width="4" stroke-linecap="round"/>' : '<path d="M228 386 L212 392" stroke="#3b2a1e" stroke-width="4" stroke-linecap="round"/>'}
      <path class="steam" d="M234 370 q-5 -9 0 -17 q5 -8 0 -16 M246 370 q-5 -9 0 -17 q5 -8 0 -16" fill="none" stroke="#fff" stroke-width="2.800" stroke-linecap="round" opacity=".85"/></g>` : ''}

  <!-- poles (behind the body) -->
  ${sit ? '' : `<g class="pole-l"><path d="M95 232 L68 436" stroke="url(#poleG)" stroke-width="4.200" stroke-linecap="round"/><path d="M62 430 h12" stroke="${C.grip}" stroke-width="3" stroke-linecap="round"/></g>
  <g class="pole-r"><path d="M205 232 L232 436" stroke="url(#poleG)" stroke-width="4.200" stroke-linecap="round"/><path d="M226 430 h12" stroke="${C.grip}" stroke-width="3" stroke-linecap="round"/></g>`}

  ${sit ? '' : `
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

`}
  <g class="upper"${sit ? ' transform="translate(0 80)"' : ''}>
    <!-- backpack -->
    <path d="M108 96 Q150 84 192 96 Q200 104 198 124 L102 124 Q100 104 108 96Z" fill="${C.pack}"/>
    <path d="M150 88 Q178 88 192 96 Q200 104 198 124 L172 124 Q176 100 150 88Z" fill="${C.packD}" opacity=".6"/>
    <path d="M94 126 Q150 112 206 126 Q214 190 206 250 Q150 262 94 250 Q86 190 94 126Z" fill="${C.pack}"/>
    <path d="M176 120 Q206 124 206 126 Q214 190 206 250 Q192 254 180 255 Q190 190 176 120Z" fill="${C.packD}" opacity=".65"/>
    <path d="M88 170 Q82 200 90 232 L100 232 L100 170Z" fill="${C.packD}"/><path d="M212 170 Q218 200 210 232 L200 232 L200 170Z" fill="${C.packD}"/>

    <!-- torso -->
    <path d="M100 135 Q126 120 150 123 Q174 120 200 135 Q204 164 197 204 L193 252 Q150 260 107 252 L103 204 Q96 164 100 135Z" fill="${C.shirt}"/>
    <path d="M168 122 Q186 125 200 135 Q204 164 197 204 L193 252 Q183 255 172 256 Q182 190 168 122Z" fill="${C.shirtD}" opacity=".55"/>
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
      ${sit ? (brew ? '' : `<g class="cup"><path d="M84 224 h20 l-2 14 q-8 4 -16 0Z" fill="#f4f1ea"/><ellipse cx="94" cy="224" rx="10" ry="2.600" fill="#2b1a10"/><path d="M104 228 q6 0 5 5 q-1 4 -6 3" fill="none" stroke="#f4f1ea" stroke-width="2.400"/><path class="steam" d="M90 216 q-4 -7 0 -13 q4 -6 0 -12 M98 216 q-4 -7 0 -13 q4 -6 0 -12" fill="none" stroke="#fff" stroke-width="2.200" stroke-linecap="round" opacity=".8"/></g>`) : `<rect x="88" y="214" width="12" height="30" rx="5" fill="${C.grip}" transform="rotate(7 94 229)"/><path d="M95 214 q9 10 4 26" fill="none" stroke="${C.red}" stroke-width="2.500"/>`}
      <path d="M84 232 q10 -7 20 0 q3 9 -4 15 q-9 4 -15 -3 q-4 -6 -1 -12Z" fill="${C.skin}"/><path d="M88 236 h13 M88 240.500 h13 M89 245 h11" stroke="${C.skinD}" stroke-width="1.300" stroke-linecap="round"/>
    </g>
    <g class="arm-r">
      <path d="M190 140 Q208 150 214 196" fill="none" stroke="${C.shirtD}" stroke-width="27" stroke-linecap="round"/>
      <path d="M214 198 Q214 220 206 236" fill="none" stroke="${C.skinD}" stroke-width="17" stroke-linecap="round"/>
      <path d="M202 196 Q214 204 226 196" fill="none" stroke="${C.shirtD}" stroke-width="5" stroke-linecap="round"/>
      <rect x="204" y="218" width="19" height="9" rx="2.500" fill="#17191b" transform="rotate(-14 213 222)"/><rect x="208" y="216" width="10" height="12" rx="3" fill="#2b2e31" transform="rotate(-14 213 222)"/>
      ${sit ? '' : `<rect x="200" y="214" width="12" height="30" rx="5" fill="${C.grip}" transform="rotate(-7 206 229)"/><path d="M205 214 q-9 10 -4 26" fill="none" stroke="${C.red}" stroke-width="2.500"/>`}
      <path d="M216 232 q-10 -7 -20 0 q-3 9 4 15 q9 4 15 -3 q4 -6 1 -12Z" fill="${C.skinD}"/><path d="M199 236 h13 M199 240.500 h13 M200 245 h11" stroke="#a9744f" stroke-width="1.300" stroke-linecap="round"/>
    </g>

    <!-- head -->
    <g class="head">
      ${mullet}${o.hat ? '' : hairBack}
      <ellipse cx="119.500" cy="84" rx="5.500" ry="9.500" fill="${C.skin}"/><ellipse cx="180.500" cy="84" rx="5.500" ry="9.500" fill="${C.skinD}"/>
      <path d="M118 82 q2.500 2 2 6" fill="none" stroke="${C.skinD}" stroke-width="1.400"/>
      <path d="M122 68 Q122 42 150 42 Q178 42 178 68 L177.500 88 Q175.500 106 165 116 Q157 124.500 150 124.500 Q143 124.500 135 116 Q124.500 106 122.500 88Z" fill="${C.skin}"/>
      <path d="M163 44 Q178.500 49 178.500 68 L178 88 Q176 104 165.500 113.500 Q160 118.500 154 120.500 Q169 104 168.500 76 Q168.500 56 163 44Z" fill="${C.skinD}" opacity=".5"/>
      <ellipse cx="132" cy="90" rx="5.500" ry="3.200" fill="#e58e7c" opacity=".33"/><ellipse cx="168" cy="90" rx="5.500" ry="3.200" fill="#e58e7c" opacity=".28"/>
      <!-- stubble -->
      <path d="M122.500 84 Q124.500 106 135 116 Q143 124.500 150 124.500 Q157 124.500 165 116 Q175.500 106 177.500 84 Q175 94 167.500 96.500 Q159 91 150 92.300 Q141 91 132.500 96.500 Q125 94 122 84Z" fill="${C.beard}" opacity=".34"/>
      <path d="M136 95.500 Q143 90 150 92.300 Q157 90 164 95.500 Q157 97.300 150 95.800 Q143 97.300 136 95.500Z" fill="${C.beard}" opacity=".2"/>
      <path d="M145 110 Q150 108 155 110 Q154 116 150 117 Q146 116 145 110Z" fill="${C.beard}" opacity=".18"/>
      <path d="M130 108 Q140 117 150 118 Q160 117 170 108" fill="none" stroke="${C.skinD}" stroke-width="1.600" stroke-linecap="round" opacity=".55"/>
      <!-- smile -->
      <path d="M138 98.500 Q150 112 162 98.500 Q150 102 138 98.500Z" fill="#7c3a33"/>
      <path d="M139.200 99.200 Q150 102.200 160.800 99.200 Q158 105.500 150 106 Q142 105.500 139.200 99.200Z" fill="#fff"/>
      <!-- nose -->
      <path d="M150.500 72 Q145 86 145.500 90 Q147.500 93 150.500 91.500 Q153.500 93 155.500 90" fill="none" stroke="${C.skinD}" stroke-width="2.300" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M152.500 76 Q154.500 84 153.500 88.500" fill="none" stroke="${C.skinL}" stroke-width="1.800" stroke-linecap="round" opacity=".8"/>
      <!-- brows -->
      <path d="M126.500 69.500 Q135 63.500 145 68" fill="none" stroke="${C.hair}" stroke-width="4.200" stroke-linecap="round"/><path d="M155 68 Q165 63.500 173.500 69.500" fill="none" stroke="${C.hair}" stroke-width="4.200" stroke-linecap="round"/>
      ${o.sleep ? closedEyes : o.glasses ? glasses : eyes}
      <!-- earring, his left ear -->
      <circle cx="182.500" cy="94.500" r="3" fill="none" stroke="#c3c8ce" stroke-width="1.700"/>
      ${o.hat ? underHat + hat : fringe + sides}
    </g>
  </g>
  ${sit ? `<g class="sit-legs">
    <path d="M110 356 L144 356 L141 418 L115 418Z" fill="${C.pant}"/><path d="M156 356 L190 356 L185 418 L159 418Z" fill="${C.pantD}"/>
    <ellipse cx="127" cy="350" rx="23" ry="17" fill="${C.pant}"/><ellipse cx="173" cy="350" rx="23" ry="17" fill="${C.pantD}"/>
    <path d="M110 344 Q127 336 144 344" fill="none" stroke="${C.pantL}" stroke-width="3" stroke-linecap="round" opacity=".7"/>
    <path d="M114 416 L142 416 Q150 426 149 436 L106 436 Q104 426 114 416Z" fill="${C.shoe}"/><rect x="103" y="434" width="49" height="7" rx="3.500" fill="${C.sole}"/>
    <path d="M158 416 L186 416 Q194 426 193 436 L151 436 Q149 426 158 416Z" fill="${C.shoeD}"/><rect x="148" y="434" width="49" height="7" rx="3.500" fill="${C.sole}"/>
  </g>` : ''}

</svg>`;
}


// Night camp: a warm, lit tent with Hagai asleep inside, and a small campfire.
function campSVG(opts) {
  const head = hagaiSVG(Object.assign({ hat: false, walk: false, sleep: true, shirt: 'black' }, opts))
    .replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return `<svg viewBox="0 0 380 240" xmlns="http://www.w3.org/2000/svg" class="camp" aria-hidden="true">
  <defs>
    <radialGradient id="tentIn" cx=".5" cy=".75" r=".7"><stop offset="0" stop-color="#ffe3a0"/><stop offset=".6" stop-color="#f6b25a"/><stop offset="1" stop-color="#d9782c"/></radialGradient>
    <radialGradient id="fireGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffb347" stop-opacity=".75"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse cx="300" cy="200" rx="90" ry="46" fill="url(#fireGlow)" class="glow"/>
  <ellipse cx="150" cy="224" rx="146" ry="12" fill="#000" opacity=".22"/>
  <path d="M10 220 L150 40 L290 220Z" fill="#e8792b"/>
  <path d="M150 40 L290 220 L222 220Z" fill="#c95f1d"/>
  <path d="M150 40 L74 220 L226 220Z" fill="url(#tentIn)"/>
  <path d="M150 40 L74 220 Q96 160 150 40Z" fill="#f08a36"/>
  <path d="M150 40 L226 220 Q204 160 150 40Z" fill="#d06a22"/>
  <path d="M150 40 L10 220 M150 40 L290 220" stroke="#8d3d12" stroke-width="3" stroke-linecap="round"/>
  <path d="M150 40 L150 28" stroke="#6b7076" stroke-width="4" stroke-linecap="round"/>
  <path d="M10 220 L-4 228 M290 220 L304 228" stroke="#6b7076" stroke-width="2" stroke-linecap="round"/>
  <svg x="104" y="126" width="92" height="88" viewBox="104 22 92 88" overflow="hidden">${head}</svg>
  <path d="M86 220 Q150 168 214 220Z" fill="#b8402e"/>
  <path d="M100 206 Q150 182 200 206" fill="none" stroke="#d65a40" stroke-width="3" stroke-linecap="round"/>
  <path d="M96 196 Q120 180 150 182" fill="none" stroke="#e7d9b8" stroke-width="7" stroke-linecap="round"/>
  <g class="fire">
    <path d="M278 222 L326 206 M282 206 L322 224" stroke="#6b4226" stroke-width="7" stroke-linecap="round"/>
    <path class="f1" d="M286 214 Q284 190 300 172 Q300 188 310 192 Q318 180 314 166 Q330 186 318 214Z" fill="#ff7a1a"/>
    <path class="f2" d="M292 214 Q292 198 302 188 Q304 198 310 200 Q314 192 312 184 Q322 198 314 214Z" fill="#ffc43a"/>
    <path class="f3" d="M298 214 Q298 204 304 198 Q306 206 310 206 Q314 210 310 214Z" fill="#fff1b0"/>
  </g>
  <g class="zzz" fill="#fff" font-family="Assistant,sans-serif" font-weight="800">
    <text x="196" y="122" font-size="20">z</text><text x="212" y="100" font-size="26">z</text><text x="232" y="76" font-size="32">z</text>
  </g>
  <g fill="#fff8d6"><circle cx="40" cy="30" r="2"/><circle cx="76" cy="12" r="1.500"/><circle cx="330" cy="26" r="2"/><circle cx="262" cy="44" r="1.300"/><circle cx="360" cy="70" r="1.600"/></g>
</svg>`;
}
export { hagaiSVG, campSVG };
