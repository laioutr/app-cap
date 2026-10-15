import { createResolver, defineNuxtModule, installModule } from '@nuxt/kit';
import type { Nuxt, NuxtModule } from '@nuxt/schema';
import type { CapOptions } from './runtime/shared/capOptions';
import { name, version } from '../package.json';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ModuleOptions {}

/** The config the module adds to `nuxt.runtimeConfig['@laioutr/app-cap']`. Server only. */
export type RuntimeConfigModulePrivate = CapOptions;

const module: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: { name, version, configKey: name },
  async setup(_options, nuxt) {
    const { resolve } = createResolver(import.meta.url);

    nuxt.options.build.transpile.push(resolve('./runtime'));

    applyRuntimeConfigTypes(nuxt);
    applyTypeScriptConfig(nuxt, resolve);

    if (nuxt.options._prepare) {
      await installModule('@laioutr-core/frontend-core');
      return;
    }
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
