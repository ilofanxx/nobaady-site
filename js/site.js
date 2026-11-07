/* nobody. site: drifting smoke, night Earth, gentle reveals.
   Ported from the app's ambient.frag and globe.frag. No trackers, no network calls. */
(function () {
  'use strict';
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var still = function () { return !!(mq && mq.matches); };

  /* ---------- shared WebGL helpers ---------- */
  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  function makeGL(canvas) {
    var opts = { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: 'low-power' };
    var gl = null;
    try { gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts); } catch (e) { gl = null; }
    return gl;
  }
  function program(gl, frag) {
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { throw new Error(gl.getShaderInfoLog(s)); }
      return s;
    }
    var pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { throw new Error(gl.getProgramInfoLog(pr)); }
    gl.useProgram(pr);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    return pr;
  }

  /* A loop that runs at a capped frame rate, pauses when hidden or off screen,
     and draws a single still frame when Reduce Motion is on. */
  function Loop(fps, draw) {
    this.gap = 1000 / fps; this.draw = draw; this.raf = 0; this.last = 0;
    this.visible = true; this.t0 = performance.now();
    var self = this;
    this.tick = function (now) {
      self.raf = 0;
      if (!self.running()) return;
      if (now - self.last >= self.gap - 2) { self.last = now; self.draw((now - self.t0) / 1000, false); }
      self.raf = requestAnimationFrame(self.tick);
    };
  }
  Loop.prototype.running = function () { return this.visible && !document.hidden && !still(); };
  Loop.prototype.kick = function () {
    if (this.running()) { if (!this.raf) this.raf = requestAnimationFrame(this.tick); }
    else if (still()) { this.draw(8, true); }
  };

  /* ---------- ambient smoke (fixed, rendered small and scaled up) ---------- */
  var AMBIENT = [
    'precision mediump float;',
    'uniform vec2 uSize;uniform float uTime;',
    'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    ' return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}',
    'float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*n(p);p=p*2.03+7.1;a*=.5;}return s;}',
    'void main(){',
    ' vec2 uv=gl_FragCoord.xy/uSize;uv.y=1.-uv.y;',
    ' float t=uTime*.035;',
    ' vec2 p=vec2(uv.x*1.5,uv.y*2.4);',
    ' float w=fbm(p+vec2(t,-t*.6));',
    ' float smoke=fbm(p*1.3+vec2(w*1.6-t*.5,w*1.1+t*.4));',
    ' vec3 top=vec3(.078,.067,.063),mid=vec3(.125,.110,.104),low=vec3(.215,.192,.180);',
    ' vec3 c=mix(top,mid,smoothstep(0.,1.,uv.y));',
    ' c=mix(c,low,smoothstep(.5,1.1,uv.y+(smoke-.5)*.4)*.6);',
    ' c+=(smoke-.45)*vec3(.12,.105,.095);',
    ' float g=exp(-pow(length((uv-vec2(.78+sin(t*2.)*.08,.14))*vec2(1.,1.5)),2.)*6.);',
    ' c+=g*vec3(.12,.092,.07);',
    ' gl_FragColor=vec4(max(c,vec3(.06,.052,.048)),1.);',
    '}'
  ].join('\n');

  function ambient() {
    var cv = document.getElementById('ambient');
    if (!cv) return;
    if (window.matchMedia && window.matchMedia('(prefers-contrast: more)').matches) return;
    var gl = makeGL(cv);
    if (!gl) return;
    var pr, uSize, uTime;
    try { pr = program(gl, AMBIENT); } catch (e) { return; }
    uSize = gl.getUniformLocation(pr, 'uSize'); uTime = gl.getUniformLocation(pr, 'uTime');
    var lastW = 0;
    function size() {
      var w = window.innerWidth, h = Math.max(window.innerHeight, screen.height || 0);
      if (Math.abs(w - lastW) < 1 && cv.height) return;
      lastW = w;
      cv.width = Math.max(48, Math.ceil(w / 7)); cv.height = Math.max(64, Math.ceil(h / 7));
      gl.viewport(0, 0, cv.width, cv.height);
    }
    size();
    var loop = new Loop(15, function (t) {
      gl.uniform2f(uSize, cv.width, cv.height); gl.uniform1f(uTime, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    window.addEventListener('resize', function () { size(); loop.kick(); });
    document.addEventListener('visibilitychange', function () { loop.kick(); });
    if (mq && mq.addEventListener) mq.addEventListener('change', function () { loop.kick(); });
    loop.kick();
    root.classList.add('has-ambient');
  }

  /* ---------- night Earth ---------- */
  var GLOBE = [
    'precision highp float;',
    'uniform vec2 uSize;uniform float uTime;uniform vec2 uRot;uniform vec3 uFocus;uniform sampler2D uTex;',
    'const float PI=3.14159265;',
    'float h(vec2 p){return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5453);}',
    'void main(){',
    ' vec2 fc=gl_FragCoord.xy;',
    ' float R=min(uSize.x,uSize.y)*.46;',
    ' vec2 q=(fc-uSize*.5)/R;',
    ' float r2=dot(q,q);',
    ' vec3 sun=normalize(vec3(-.55,.62,.56));',
    ' vec4 o=vec4(0.);',
    ' vec2 sc=floor(fc/3.);',
    ' float st=step(.9965,h(sc))*(.4+.6*sin(uTime*1.3+h(sc+3.)*40.));',
    ' o.rgb+=vec3(.85,.8,.72)*max(st,0.)*.5*smoothstep(1.03,1.2,sqrt(r2));',
    ' o.a=max(o.a,length(o.rgb));',
    ' if(r2<1.){',
    '  vec3 nrm=vec3(q,sqrt(1.-r2));',
    '  float ct=cos(uRot.y),s2=sin(uRot.y);',
    '  vec3 v=vec3(nrm.x,nrm.y*ct+nrm.z*s2,-nrm.y*s2+nrm.z*ct);',
    '  float lat=asin(clamp(v.y,-1.,1.));',
    '  float lon=atan(v.x,v.z)+uRot.x;',
    '  vec2 uv=vec2(fract(lon/(2.*PI)+.5),.5-lat/PI);',
    '  vec4 tx=texture2D(uTex,uv);',
    '  float lightsV=tx.r,land=tx.g,coast=tx.b;',
    '  float tw=.86+.14*sin(uTime*1.6+h(floor(uv*900.))*30.);',
    '  vec3 ocean=vec3(.022,.032,.052);',
    '  vec3 ground=vec3(.070,.068,.070)*(.5+land*.7);',
    '  vec3 c=mix(ocean,ground,smoothstep(.2,.62,land));',
    '  c+=coast*vec3(.035,.036,.04);',
    '  float dayL=max(dot(nrm,sun),0.);',
    '  c*=.55+dayL*1.25;',
    '  c+=pow(max(dot(reflect(-sun,nrm),vec3(0.,0.,1.)),0.),22.)*(1.-smoothstep(.1,.5,land))*vec3(.10,.11,.13);',
    '  vec3 gold=mix(vec3(1.,.62,.26),vec3(1.,.93,.72),smoothstep(.35,.95,lightsV));',
    '  c+=gold*lightsV*lightsV*1.05*tw+gold*lightsV*.3;',
    '  float fl=uFocus.x,fa=uFocus.y;',
    '  vec3 fv=vec3(cos(fa)*sin(fl),sin(fa),cos(fa)*cos(fl));',
    '  vec3 pv=vec3(cos(lat)*sin(lon),sin(lat),cos(lat)*cos(lon));',
    '  float ang=acos(clamp(dot(pv,fv),-1.,1.));',
    '  float k=fract(uTime*.22);',
    '  float d0=(ang-k*.5)*34.;',
    '  float ring=exp(-d0*d0)*(1.-k);',
    '  c+=vec3(1.,.82,.5)*(exp(-ang*ang*90.)*.42+ring*.55)*uFocus.z;',
    '  float fres=pow(1.-nrm.z,3.2);',
    '  c+=vec3(.46,.52,.62)*fres*(.22+dayL*.85);',
    '  float edge=smoothstep(1.,.985,sqrt(r2));',
    '  o=vec4(c*edge,edge);',
    ' }',
    ' float d=sqrt(r2);',
    ' float halo=exp(-max(d-1.,0.)*15.)*step(.985,d);',
    ' vec3 hc=mix(vec3(.75,.68,.6),vec3(.62,.72,.86),.4)*(.2+.8*max(dot(normalize(vec3(q,.1)),sun),0.));',
    ' o.rgb+=hc*halo*.75;',
    ' o.a=max(o.a,halo*.8);',
    ' gl_FragColor=o;',
    '}'
  ].join('\n');

  function globe() {
    var wrap = document.querySelector('[data-globe]');
    if (!wrap) return;
    var cv = wrap.querySelector('canvas');
    var gl = makeGL(cv);
    if (!gl) return;
    var pr;
    try { pr = program(gl, GLOBE); } catch (e) { return; }
    var U = {};
    ['uSize', 'uTime', 'uRot', 'uFocus', 'uTex'].forEach(function (n) { U[n] = gl.getUniformLocation(pr, n); });

    var RAD = Math.PI / 180;
    var focusLon = 50 * RAD, focusLat = 25 * RAD;
    var lon = focusLon - 0.35, tilt = focusLat * 0.7;
    var toLon = focusLon, toTilt = tilt;
    var mode = 'fly', holdUntil = 0, vel = 0, last = 0, dragging = false, ready = false;
    var SPIN = 0.045; // radians per second, about one turn every two and a half minutes

    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.uniform1i(U.uTex, 0);

    function size() {
      var r = cv.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
    }
    function shortTo(from, to) {
      var d = (to - from) % (2 * Math.PI);
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      return from + d;
    }
    function step(t, frozen) {
      var dt = Math.min(Math.max(t - last, 0), 0.05); last = t;
      if (frozen) { lon = toLon; tilt = toTilt; return; }
      if (dragging) return;
      if (Math.abs(vel) > 0.002) { lon += vel * dt; vel *= Math.pow(0.04, dt); toLon = lon; return; }
      if (mode === 'fly') {
        lon += (toLon - lon) * Math.min(1, dt * 2.2);
        tilt += (toTilt - tilt) * Math.min(1, dt * 2.2);
        if (Math.abs(toLon - lon) < 0.003 && t > holdUntil) mode = 'spin';
      } else {
        lon += SPIN * dt;
        tilt += (toTilt - tilt) * Math.min(1, dt * 1.5);
      }
    }
    function draw(t, frozen) {
      if (!ready) return;
      size();
      step(t, frozen);
      gl.uniform2f(U.uSize, cv.width, cv.height);
      gl.uniform1f(U.uTime, t);
      gl.uniform2f(U.uRot, lon, tilt);
      gl.uniform3f(U.uFocus, focusLon, focusLat, 1);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    var loop = new Loop(30, draw);

    var img = new Image();
    img.decoding = 'async';
    img.onload = function () {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      ready = true;
      wrap.classList.add('is-live');
      loop.kick();
    };
    img.src = wrap.getAttribute('data-globe');

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        loop.visible = es[0].isIntersecting; loop.kick();
      }, { rootMargin: '120px' }).observe(wrap);
    }
    window.addEventListener('resize', function () { loop.kick(); });
    document.addEventListener('visibilitychange', function () { loop.kick(); });
    if (mq && mq.addEventListener) mq.addEventListener('change', function () { loop.kick(); });

    /* Horizontal drag spins the planet; vertical swipes still scroll the page. */
    var px = 0, py = 0, lastX = 0, lastT = 0, axis = '';
    cv.addEventListener('pointerdown', function (e) {
      px = lastX = e.clientX; py = e.clientY; lastT = performance.now(); axis = ''; dragging = true; vel = 0;
    });
    cv.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      if (!axis) {
        var ax = Math.abs(e.clientX - px), ay = Math.abs(e.clientY - py);
        if (ax < 6 && ay < 6) return;
        axis = ax > ay ? 'x' : 'y';
        if (axis === 'y') { dragging = false; return; }
        try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
      var now = performance.now(), dx = e.clientX - lastX;
      lon -= dx * 0.0062; toLon = lon; mode = 'spin';
      vel = -dx / Math.max(1, now - lastT) * 1000 * 0.0042 * 0.6;
      lastX = e.clientX; lastT = now;
      if (still()) loop.draw(8, false);
    });
    function end() {
      if (!dragging) return;
      dragging = false;
      if (still() || performance.now() - lastT > 120) vel = 0;
      loop.kick();
    }
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);

    /* Region chips fly the globe to a place, then it keeps turning. */
    var chips = document.querySelectorAll('[data-fly]');
    Array.prototype.forEach.call(chips, function (b) {
      b.addEventListener('click', function () {
        var ll = b.getAttribute('data-fly').split(',');
        toLon = shortTo(lon, parseFloat(ll[0]) * RAD);
        toTilt = parseFloat(ll[1]) * RAD * 0.7;
        vel = 0; mode = 'fly'; holdUntil = last + 6;
        Array.prototype.forEach.call(chips, function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); });
        loop.kick();
        if (still()) { lon = toLon; tilt = toTilt; loop.draw(8, true); }
      });
    });
  }

  /* ---------- reveals, wordmark, small interactions ---------- */
  function reveals() {
    var els = document.querySelectorAll('.rise');
    if (still() || !('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(els, function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    Array.prototype.forEach.call(els, function (el) { io.observe(el); });
  }

  function visibilityDemo() {
    var sw = document.querySelector('[data-show-photo]');
    if (!sw) return;
    var card = sw.closest('.idcard');
    sw.addEventListener('click', function () {
      var on = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
      card.classList.toggle('photo-hidden', !on);
      var label = card.querySelector('[data-state]');
      if (label) label.textContent = label.getAttribute(on ? 'data-on' : 'data-off');
    });
  }

  function boot() {
    window.__nobody = 1;
    root.classList.add('js');
    try { ambient(); } catch (e) { /* smoke is decoration */ }
    try { globe(); } catch (e) { /* the static globe stays */ }
    reveals();
    visibilityDemo();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
