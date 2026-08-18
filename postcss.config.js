export default {
  plugins: {
    '@tailwindcss/postcss': {},
    // autoprefixer removed: Tailwind v4 handles vendor prefixing internally
    // (via Lightning CSS) — running it again on top is redundant.
  },
}
