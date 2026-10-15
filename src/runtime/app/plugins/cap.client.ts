import { defineNuxtPlugin } from 'nuxt/app';
import { useBotProtection } from '#imports';
import { createCapAdapter } from '../createAdapter';

export default defineNuxtPlugin(() => {
  useBotProtection().setAdapter(createCapAdapter());
});
