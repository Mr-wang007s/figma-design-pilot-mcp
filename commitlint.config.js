export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature         → minor bump
        'fix',      // Bug fix             → patch bump
        'perf',     // Performance          → patch bump
        'refactor', // Refactor            → no bump (unless BREAKING CHANGE)
        'docs',     // Documentation       → no bump
        'chore',    // Maintenance         → no bump
        'ci',       // CI/CD changes       → no bump
        'test',     // Tests               → no bump
        'build',    // Build system        → no bump
        'revert',   // Revert commit       → patch bump
      ],
    ],
    // BREAKING CHANGE in footer or ! after type → major bump
  },
};
