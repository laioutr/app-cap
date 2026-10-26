// Nitro tells Rollup this module has no side effects, so Rollup may evaluate it in any chunk. It throws only when called.
const notBundled = () => {
  throw new Error('[@laioutr/app-cap] Not bundled: capjs-core needs this only for an obfuscation level above 3.');
};

// The shapes capjs-core calls: esbuild's `transform`, and javascript-obfuscator's default export.
export const transform = notBundled;
export default { obfuscate: notBundled };
