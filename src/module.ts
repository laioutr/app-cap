import { addPlugin, addServerHandler, addServerPlugin, createResolver, defineNuxtModule, installModule, useLogger } from '@nuxt/kit';
import { defu } from 'defu';
import { type CapModuleOptions, resolveCapOptions } from './module/resolveCapOptions';
import { API_BASE, APP_NAME, ASSET_BASE } from './runtime/shared/constants';
import type { CapOptions } from './runtime/shared/capOptions';
import type { Nuxt, NuxtModule } from '@nuxt/schema';
import { name, version } from '../package.json';

export type ModuleOptions = CapModuleOptions;

/** The config the module adds to `nuxt.runtimeConfig['@laioutr/app-cap']`. Server only. */
export type RuntimeConfigModulePrivate = CapOptions;

const ONE_YEAR_S = 60 * 60 * 24 * 365;

const module: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: { name, version, configKey: name },
  async setup(rawOptions, nuxt) {
    const logger = useLogger(name);
    const { resolve, resolvePath } = createResolver(import.meta.url);
    const runtime = (path: string) => resolve('./runtime', path);

    nuxt.options.build.transpile.push(resolve('./runtime'));

    applyRuntimeConfigTypes(nuxt);
    applyTypeScriptConfig(nuxt, resolve);

    if (nuxt.options._prepare) {
      await installModule('@laioutr-core/frontend-core');
      return;
    }

    const { options, warnings } = resolveCapOptions(rawOptions);
    for (const warning of warnings) logger.warn(warning);

    // frontend-core reads this to warn when protected actions have no provider. Either module may run first.
    (nuxt.options.runtimeConfig as any).laioutr = defu(
      { botProtection: { provider: APP_NAME } },
      (nuxt.options.runtimeConfig as any).laioutr
    );
    nuxt.options.runtimeConfig[name] = options;

    addPlugin({ src: runtime('app/plugins/cap.client'), mode: 'client' });
    addServerPlugin(runtime('server/plugins/capVerifier'));
    addServerHandler({ route: `${API_BASE}challenge`, method: 'post', handler: runtime('server/api/challenge.post') });
    addServerHandler({ route: `${API_BASE}redeem`, method: 'post', handler: runtime('server/api/redeem.post') });

    // The package build renames `.mjs` to `.js`, so the extension differs between source and dist.
    const unbundled = await resolvePath(runtime('server/lib/unbundled'));
    nuxt.hook('nitro:config', (config) => {
      // The widget version is in the path, so the files never change under a URL.
      config.publicAssets ??= [];
      // Its own base, because Nitro sends the cache header only for a directory with one. The base is the
      // versioned path: Nitro's Vercel rule for `/app-cap` would also match a page such as `/app-capabilities`.
      const assetBase = ASSET_BASE.replace(/\/$/, '');
      config.publicAssets.push({ dir: runtime(`app/public${assetBase}`), baseURL: assetBase, maxAge: ONE_YEAR_S });
      // Inlined, so the aliases below reach its imports. External, it brings esbuild's 11 MB binary along.
      config.externals = defu(config.externals ?? {}, { inline: ['capjs-core'] });
      config.alias = { ...config.alias, esbuild: unbundled, 'javascript-obfuscator': unbundled };
    });
  },
});

export default module;

const applyRuntimeConfigTypes = (nuxt: Nuxt) => {
  const { resolve } = createResolver(import.meta.url);
  const typed = (config: unknown, type: string) => ({
    ...(config as Record<string, unknown>),
    $schema: { tsType: `import(${JSON.stringify(resolve('./module'))}).${type}` },
  });

  nuxt.hook('app:templates', (app) => {
    const index = app.templates.findIndex((template) => template.filename === 'types/schema.d.ts');
    const schema = app.templates[index];
    const getContents = schema?.getContents;
    if (!schema || !getContents) return;
    app.templates[index] = {
      ...schema,
      getContents: (data) => {
        const { runtimeConfig } = data.nuxt.options;
        const options = Object.create(data.nuxt.options, {
          runtimeConfig: { value: { ...runtimeConfig, [name]: typed(runtimeConfig[name], 'RuntimeConfigModulePrivate') } },
        });
        return getContents({ ...data, nuxt: Object.create(data.nuxt, { options: { value: options } }) });
      },
    };
  });
};

const applyTypeScriptConfig = (nuxt: Nuxt, resolve: (...path: string[]) => string) => {
  if (nuxt.options._prepare && nuxt.options.rootDir === resolve('..')) {
    const serverRuntime = resolve('./runtime/server');
    nuxt.hook('prepare:types', ({ tsConfig }) => {
      tsConfig.exclude = [...(tsConfig.exclude ?? []), serverRuntime, resolve('../playground')];
    });
    nuxt.hook('nitro:init', (nitro) => {
      nitro.hooks.hook('types:extend', ({ tsConfig }) => {
        if (!tsConfig) return;
        tsConfig.include = [...(tsConfig.include ?? []).filter((path) => !path.endsWith('**/*')), serverRuntime];
      });
    });
  }
};
