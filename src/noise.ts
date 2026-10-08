// Simplex-ish 3D noise (Stefan Gustavson's public-domain algorithm, compacted).
// No dependency needed for a handful of octaves of organic deformation.
const grad3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
const p: number[] = [];
for (let i = 0; i < 256; i++) p[i] = Math.floor(Math.random() * 256);
const perm = new Array(512);
for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

function dot(g: number[], x: number, y: number, z: number) { return g[0] * x + g[1] * y + g[2] * z; }

export function noise3(xin: number, yin: number, zin: number): number {
  const F3 = 1 / 3, G3 = 1 / 6;
  const s = (xin + yin + zin) * F3;
  const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
  const t = (i + j + k) * G3;
  const X0 = i - t, Y0 = j - t, Z0 = k - t;
  const x0 = xin - X0, y0 = yin - Y0, z0 = zin - Z0;
  let i1, j1, k1, i2, j2, k2;
  if (x0 >= y0) {
    if (y0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=1;k2=0; }
    else if (x0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=0;k2=1; }
    else { i1=0;j1=0;k1=1;i2=1;j2=0;k2=1; }
  } else {
    if (y0 < z0) { i1=0;j1=0;k1=1;i2=0;j2=1;k2=1; }
    else if (x0 < z0) { i1=0;j1=1;k1=0;i2=0;j2=1;k2=1; }
    else { i1=0;j1=1;k1=0;i2=1;j2=1;k2=0; }
  }
  const x1=x0-i1+G3, y1=y0-j1+G3, z1=z0-k1+G3;
  const x2=x0-i2+2*G3, y2=y0-j2+2*G3, z2=z0-k2+2*G3;
  const x3=x0-1+3*G3, y3=y0-1+3*G3, z3=z0-1+3*G3;
  const ii=i&255, jj=j&255, kk=k&255;
  const gi0 = perm[ii+perm[jj+perm[kk]]] % 12;
  const gi1 = perm[ii+i1+perm[jj+j1+perm[kk+k1]]] % 12;
  const gi2 = perm[ii+i2+perm[jj+j2+perm[kk+k2]]] % 12;
  const gi3 = perm[ii+1+perm[jj+1+perm[kk+1]]] % 12;
  let n0=0,n1=0,n2=0,n3=0;
  let t0=0.6-x0*x0-y0*y0-z0*z0; if(t0>0){t0*=t0;n0=t0*t0*dot(grad3[gi0],x0,y0,z0);}
  let t1=0.6-x1*x1-y1*y1-z1*z1; if(t1>0){t1*=t1;n1=t1*t1*dot(grad3[gi1],x1,y1,z1);}
  let t2=0.6-x2*x2-y2*y2-z2*z2; if(t2>0){t2*=t2;n2=t2*t2*dot(grad3[gi2],x2,y2,z2);}
  let t3=0.6-x3*x3-y3*y3-z3*z3; if(t3>0){t3*=t3;n3=t3*t3*dot(grad3[gi3],x3,y3,z3);}
  return 16 * (n0+n1+n2+n3); // ~[-1,1]
}

export function fbm3(x: number, y: number, z: number, octaves = 4): number {
  let total = 0, amp = 1, freq = 1, max = 0;
  for (let i = 0; i < octaves; i++) {
    total += noise3(x * freq, y * freq, z * freq) * amp;
    max += amp;
    amp *= 0.5; freq *= 2;
  }
  return total / max;
}
