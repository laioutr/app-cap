// A protected app route, so the playground exercises the whole path: header, verifier, policy.
export default defineEventHandler(async (event) => {
  await requireBotProtection(event, { action: 'app-cap/playground-check' });
  return { ok: true };
});
