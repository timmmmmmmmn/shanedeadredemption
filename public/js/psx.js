import * as THREE from './three.module.min.js';

// PS1-look (zelfde truc als Jens Run): vertices springen naar een grof raster, textures worden
// een beetje affiene getekend, licht per hoekpunt (Gouraud), 15-bit kleur met bayer-dither en mist in banden.
export function patchPSX() {
  const C = THREE.ShaderChunk;
  const affine = `
#ifdef USE_MAP
  vPsxUv = vec3(vMapUv * gl_Position.w, gl_Position.w);
#endif`;
  C.uv_pars_vertex += '\nvarying vec3 vPsxUv;\n';
  C.uv_pars_fragment += '\nvarying vec3 vPsxUv;\n';
  C.project_vertex += affine + `
  {
    float psxA = projectionMatrix[1][1] / projectionMatrix[0][0];
    vec2 psxGrid = psxA >= 1.0 ? vec2(120.0 * psxA, 120.0) : vec2(120.0, 120.0 / psxA);
    vec4 sp = gl_Position;
    if (sp.w > 0.0) { sp.xy = floor(sp.xy / sp.w * psxGrid + 0.5) / psxGrid * sp.w; gl_Position = sp; }
  }`;
  C.map_fragment = C.map_fragment.replace('vec4 sampledDiffuseColor = texture2D( map, vMapUv );', `
#ifdef PSX_PERSP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
#else
  vec4 sampledDiffuseColor = texture2D( map, mix( vMapUv, vPsxUv.xy / vPsxUv.z, 0.3 ) );
#endif
  {
    float psxL = max(sampledDiffuseColor.r, max(sampledDiffuseColor.g, sampledDiffuseColor.b)) + 0.001;
    float psxQ2 = floor(sqrt(psxL) * 12.0 + 0.5) / 12.0;
    sampledDiffuseColor.rgb *= psxQ2 * psxQ2 / psxL;
  }`);
  const bayer = `ivec2 psxP = ivec2(gl_FragCoord.xy) & 3;
    int psxQ = psxP.x ^ psxP.y;
    float psxD = (float((psxQ & 1) * 8 + (psxP.y & 1) * 4 + ((psxQ >> 1) & 1) * 2 + ((psxP.y >> 1) & 1)) + 0.5) / 16.0;`;
  C.fog_fragment = `
#ifdef USE_FOG
  {
    ${bayer}
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    fogFactor = floor( fogFactor * 12.0 + psxD ) / 12.0;
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  }
#endif`;
  const dither = `
  {
    ${bayer}
    vec3 c = gl_FragColor.rgb;
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = clamp(mix(vec3(l), c, 1.15), 0.0, 1.0);
    c = mix(c, c * c * (3.0 - 2.0 * c), 0.5);
    gl_FragColor.rgb = floor(c * 31.0 + psxD) / 31.0;
  }`;
  C.dithering_fragment += dither;
  const sp = THREE.ShaderLib.sprite;
  sp.vertexShader = sp.vertexShader.replace('#include <logdepthbuf_vertex>', affine + '\n#include <logdepthbuf_vertex>');
  sp.fragmentShader = sp.fragmentShader.replace('#include <fog_fragment>', '#include <fog_fragment>' + dither);
  const L = THREE.ShaderLib.lambert;
  L.vertexShader = L.vertexShader
    .replace('#include <common>', '#include <common>\n#include <lights_pars_begin>\nvarying vec3 vPsxLight;')
    .replace('#include <fog_vertex>', `#include <fog_vertex>
  {
    vec3 n = normalize(transformedNormal), li = ambientLightColor;
    float up = 0.0;
    #if NUM_HEMI_LIGHTS > 0
      for (int i = 0; i < NUM_HEMI_LIGHTS; i++) { li += getHemisphereLightIrradiance(hemisphereLights[i], n); up = dot(n, hemisphereLights[i].direction); }
    #endif
    #if NUM_DIR_LIGHTS > 0
      for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
        float d = dot(n, directionalLights[i].direction);
        #ifdef DOUBLE_SIDED
          d = abs(d);
        #endif
        li += saturate(d) * directionalLights[i].color;
      }
    #endif
    #if NUM_POINT_LIGHTS > 0
      for (int i = 0; i < NUM_POINT_LIGHTS; i++) {
        vec3 v = pointLights[i].position - mvPosition.xyz;
        float r = length(v), d = dot(n, v / r);
        li += saturate(d * 0.7 + 0.3) * pointLights[i].color * getDistanceAttenuation(r, pointLights[i].distance, pointLights[i].decay);
      }
    #endif
    vec4 wp = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      wp = instanceMatrix * wp;
    #endif
    float wy = (modelMatrix * wp).y;
    float ao = wy < -0.5 ? 1.0 : mix(0.6, 1.0, smoothstep(0.0, 1.9, wy));
    vPsxLight = li * RECIPROCAL_PI * mix(ao, 1.0, saturate(up));
  }`);
  const a = '#include <normal_fragment_begin>', b = 'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;';
  const fs = L.fragmentShader, i0 = fs.indexOf(a), i1 = fs.indexOf(b) + b.length, oud = fs.slice(i0, i1);
  L.fragmentShader = (fs.slice(0, i0) + `#ifdef FLAT_SHADED
  ${oud}
#else
  #include <emissivemap_fragment>
  vec3 outgoingLight = diffuseColor.rgb * vPsxLight + totalEmissiveRadiance;
#endif` + fs.slice(i1)).replace('#include <common>', '#include <common>\nvarying vec3 vPsxLight;');
}

export function psxTex(t, repeat) {
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.generateMipmaps = true;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

// kleine textures, getekend op een canvas
export function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  draw(x, w, h);
  return psxTex(new THREE.CanvasTexture(c), repeat);
}

// vaste random zodat textures en levels elke keer hetzelfde zijn
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function noise(x, w, h, base, vary, n, r) {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = (r() - 0.5) * vary;
    x.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 240 : 0},${v > 0 ? 220 : 0},${Math.abs(v)})`;
    x.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1 + Math.floor(r() * 2), 1);
  }
}

function planks(x, w, h, base, r, horiz = false, n = 6) {
  noise(x, w, h, base, 0.25, 500, r);
  x.fillStyle = 'rgba(0,0,0,0.45)';
  const s = (horiz ? h : w) / n;
  for (let i = 0; i < n; i++) {
    if (horiz) x.fillRect(0, Math.floor(i * s), w, 1); else x.fillRect(Math.floor(i * s), 0, 1, h);
    // nerf
    x.fillStyle = 'rgba(0,0,0,0.15)';
    for (let k = 0; k < 3; k++) {
      if (horiz) x.fillRect(Math.floor(r() * w), Math.floor(i * s + 2 + r() * (s - 4)), 4 + Math.floor(r() * 10), 1);
      else x.fillRect(Math.floor(i * s + 2 + r() * (s - 4)), Math.floor(r() * h), 1, 4 + Math.floor(r() * 10));
    }
    x.fillStyle = 'rgba(0,0,0,0.45)';
  }
}

const texCache = {};
export function tex(name) {
  if (texCache[name]) return texCache[name];
  const r = rng([...name].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  let t;
  const T = (w, h, f) => canvasTex(w, h, f);
  switch (name) {
    case 'sand': t = T(64, 64, (x, w, h) => noise(x, w, h, '#c4a06a', 0.35, 900, r)); break;
    case 'road': t = T(64, 64, (x, w, h) => { noise(x, w, h, '#a98457', 0.35, 900, r); x.fillStyle = 'rgba(70,45,20,0.25)'; x.fillRect(12, 0, 5, h); x.fillRect(46, 0, 5, h); }); break;
    case 'grass': t = T(64, 64, (x, w, h) => { noise(x, w, h, '#7d8441', 0.4, 900, r); x.fillStyle = 'rgba(40,60,10,0.4)'; for (let i = 0; i < 120; i++) x.fillRect(r() * w | 0, r() * h | 0, 1, 3); }); break;
    case 'forest': t = T(64, 64, (x, w, h) => { noise(x, w, h, '#4f5a2a', 0.4, 900, r); x.fillStyle = 'rgba(90,60,30,0.5)'; for (let i = 0; i < 60; i++) x.fillRect(r() * w | 0, r() * h | 0, 2, 2); }); break;
    case 'snow': t = T(64, 64, (x, w, h) => noise(x, w, h, '#dfe7ee', 0.18, 700, r)); break;
    case 'mud': t = T(64, 64, (x, w, h) => noise(x, w, h, '#5e5236', 0.35, 900, r)); break;
    case 'heath': t = T(64, 64, (x, w, h) => { noise(x, w, h, '#6d5a4a', 0.35, 800, r); x.fillStyle = 'rgba(150,70,140,0.5)'; for (let i = 0; i < 160; i++) x.fillRect(r() * w | 0, r() * h | 0, 1, 1); }); break;
    case 'cave': t = T(64, 64, (x, w, h) => noise(x, w, h, '#4a3f35', 0.4, 900, r)); break;
    case 'cobble': t = T(64, 64, (x, w, h) => { noise(x, w, h, '#7b7268', 0.3, 400, r); x.fillStyle = 'rgba(0,0,0,0.35)'; for (let yy = 0; yy < h; yy += 8) { x.fillRect(0, yy, w, 1); for (let xx = (yy / 8) % 2 * 5; xx < w; xx += 10) x.fillRect(xx, yy, 1, 8); } }); break;
    case 'rock': t = T(64, 64, (x, w, h) => { noise(x, w, h, '#9a6545', 0.35, 900, r); for (let yy = 0; yy < h; yy += 6 + (r() * 6 | 0)) { x.fillStyle = `rgba(${r() > 0.5 ? '60,30,15' : '230,170,120'},0.25)`; x.fillRect(0, yy, w, 2 + (r() * 3 | 0)); } }); break;
    case 'rockgrey': t = T(64, 64, (x, w, h) => { noise(x, w, h, '#7d7a72', 0.4, 900, r); x.fillStyle = 'rgba(0,0,0,0.3)'; for (let i = 0; i < 12; i++) x.fillRect(r() * w | 0, r() * h | 0, 6 + r() * 12 | 0, 1); }); break;
    case 'planks': t = T(64, 64, (x, w, h) => planks(x, w, h, '#8a5a32', r)); break;
    case 'planksH': t = T(64, 64, (x, w, h) => planks(x, w, h, '#7c5130', r, true, 8)); break;
    case 'planksDark': t = T(64, 64, (x, w, h) => planks(x, w, h, '#4d3420', r)); break;
    case 'planksGrey': t = T(64, 64, (x, w, h) => planks(x, w, h, '#77706a', r, true, 8)); break;
    case 'floor': t = T(64, 64, (x, w, h) => planks(x, w, h, '#6b4526', r, true, 5)); break;
    case 'brick': t = T(64, 64, (x, w, h) => { noise(x, w, h, '#8c4a33', 0.3, 500, r); x.fillStyle = 'rgba(220,200,180,0.5)'; for (let yy = 0; yy < h; yy += 6) { x.fillRect(0, yy, w, 1); for (let xx = (yy / 6) % 2 * 8; xx < w; xx += 16) x.fillRect(xx, yy, 1, 6); } }); break;
    case 'roof': t = T(64, 64, (x, w, h) => { noise(x, w, h, '#4b3a2e', 0.3, 500, r); x.fillStyle = 'rgba(0,0,0,0.5)'; for (let yy = 0; yy < h; yy += 6) { x.fillRect(0, yy, w, 1); for (let xx = (yy / 6) % 2 * 4; xx < w; xx += 8) x.fillRect(xx, yy, 1, 6); } }); break;
    case 'canvas': t = T(32, 32, (x, w, h) => noise(x, w, h, '#d8cdb0', 0.2, 300, r)); break;
    case 'crate': t = T(32, 32, (x, w, h) => { planks(x, w, h, '#9a6a3a', r, true, 4); x.strokeStyle = '#4a2e18'; x.lineWidth = 3; x.strokeRect(1.5, 1.5, w - 3, h - 3); x.beginPath(); x.moveTo(2, 2); x.lineTo(w - 2, h - 2); x.stroke(); }); break;
    case 'barrel': t = T(32, 32, (x, w, h) => { planks(x, w, h, '#7a4a28', r, false, 8); x.fillStyle = '#3a3a3a'; x.fillRect(0, 5, w, 2); x.fillRect(0, h - 7, w, 2); }); break;
    case 'hay': t = T(32, 32, (x, w, h) => { noise(x, w, h, '#d6b85a', 0.3, 300, r); x.fillStyle = 'rgba(120,90,20,0.5)'; for (let i = 0; i < 40; i++) x.fillRect(r() * w | 0, r() * h | 0, 3, 1); }); break;
    case 'bark': t = T(32, 32, (x, w, h) => planks(x, w, h, '#4e3b28', r, false, 5)); break;
    case 'leaves': t = T(32, 32, (x, w, h) => { noise(x, w, h, '#3d5a26', 0.5, 300, r); }); break;
    case 'pine': t = T(32, 32, (x, w, h) => { noise(x, w, h, '#2c4a2e', 0.4, 300, r); }); break;
    case 'water': t = T(64, 64, (x, w, h) => { noise(x, w, h, '#3d6a7a', 0.25, 300, r); x.fillStyle = 'rgba(200,230,240,0.35)'; for (let i = 0; i < 30; i++) x.fillRect(r() * w | 0, r() * h | 0, 4 + r() * 6 | 0, 1); }); break;
    case 'swamp': t = T(64, 64, (x, w, h) => { noise(x, w, h, '#47533a', 0.3, 300, r); x.fillStyle = 'rgba(160,190,120,0.4)'; for (let i = 0; i < 40; i++) x.fillRect(r() * w | 0, r() * h | 0, 2, 2); }); break;
    case 'metal': t = T(32, 32, (x, w, h) => noise(x, w, h, '#3f3f42', 0.3, 300, r)); break;
    case 'rail': t = T(32, 32, (x, w, h) => { noise(x, w, h, '#a98457', 0.3, 200, r); x.fillStyle = '#4a3420'; for (let yy = 2; yy < h; yy += 8) x.fillRect(0, yy, w, 4); x.fillStyle = '#555'; x.fillRect(6, 0, 3, h); x.fillRect(w - 9, 0, 3, h); }); break;
    case 'plaster': t = T(64, 64, (x, w, h) => noise(x, w, h, '#d9c8a8', 0.25, 700, r)); break;
    default: t = T(16, 16, (x, w, h) => noise(x, w, h, '#888', 0.3, 50, r));
  }
  texCache[name] = t;
  return t;
}
