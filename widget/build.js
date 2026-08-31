const esbuild = require('esbuild')
const isProd = process.env.NODE_ENV === 'production'

/** Public browser configuration is injected by the protected build workflow. */
const supabaseProjectUrl = process.env.SUPABASE_URL || (isProd ? '' : 'https://example.invalid')
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || (isProd ? '' : 'development-placeholder')

if (!supabaseProjectUrl || !supabaseAnonKey) {
  throw new Error('Production widget builds require SUPABASE_URL and SUPABASE_ANON_KEY')
}
if (isProd && !/^https:\/\/[a-z0-9.-]+$/i.test(supabaseProjectUrl)) {
  throw new Error('SUPABASE_URL must be an absolute HTTPS origin')
}

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
      SUPABASE_ANON_KEY: JSON.stringify(supabaseAnonKey),
    },
  })
  .then(() => {
    console.log('Widget built successfully → dist/widget.js')
  })
  .catch((err) => {
    console.error('Build failed:', err)
    process.exit(1)
  })
