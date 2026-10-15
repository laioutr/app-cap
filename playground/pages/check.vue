<script setup lang="ts">
const result = ref('');
let lastHeaders: Record<string, string> = {};

const send = async (headers: Record<string, string>) => {
  try {
    const body = await $fetch('/api/playground-check', { method: 'POST', headers });
    result.value = `200 ${JSON.stringify(body)}`;
  } catch (error) {
    const { statusCode, data } = error as { statusCode?: number; data?: unknown };
    result.value = `${statusCode ?? 'error'} ${JSON.stringify(data ?? (error as Error).message)}`;
  }
};

const protect = async () => {
  result.value = 'running';
  try {
    lastHeaders = await useBotProtection().prepare({ action: 'app-cap/playground-check' });
  } catch (error) {
    result.value = `prepare failed: ${(error as Error).message}`;
    return;
  }
  await send(lastHeaders);
};

// Sends the last proof again, which the server must refuse.
const reuse = () => send(lastHeaders);
</script>

<template>
  <main>
    <button type="button" data-protect @click="protect">Run a protected action</button>
    <button type="button" data-reuse @click="reuse">Send the last proof again</button>
    <output data-result>{{ result }}</output>
  </main>
</template>
