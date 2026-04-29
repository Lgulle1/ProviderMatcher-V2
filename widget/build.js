const esbuild = require('esbuild')
const isProd = process.env.NODE_ENV === 'production'

/** Set SUPABASE_URL to your project URL (e.g. https://xyzcompany.supabase.co) for production builds. */
const supabaseProjectUrl = process.env.SUPABASE_URL || 'https://wuhtfeptdrbdlmnxtumo.supabase.co'

esbuild
  .build({
    entryPoints: ['src/widget.js'],
    bundle: true,
    minify: isProd,
    outfile: 'dist/widget.js',
    format: 'iife',
    globalName: 'ProviderMatcherWidget',
    define: {
      SUPABASE_URL: JSON.stringify(supabaseProjectUrl),
    },
  })
  .then(() => {
    console.log('Widget built successfully → dist/widget.js')
  })
  .catch((err) => {
    console.error('Build failed:', err)
    process.exit(1)
  })
