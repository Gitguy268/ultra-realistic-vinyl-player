export default {
  extends: ['@commitlint/config-conventional'],
  // Dependabot writes long changelog bodies that it cannot wrap.
  ignores: [(message) => message.includes('Signed-off-by: dependabot[bot]')],
};
