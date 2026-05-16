import '@testing-library/jest-dom/vitest';

// Phaser uses canvas APIs that jsdom doesn't fully implement. We never boot
// Phaser in jsdom for unit tests; the App smoke test stubs the Phaser host
// component. This setup file is intentionally minimal.
