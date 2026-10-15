import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
  externals: ['defu', 'h3', '@parcel/watcher', '@laioutr-core/frontend-core'],
});
