import esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

const config = {
  entryPoints: ['src/frontend/index.tsx'],
  bundle: true,
  outfile: 'public/js/bundle.js',
  platform: 'browser',
  target: 'es2020',
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts'
  },
  sourcemap: true
};

if (isWatch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log('👀 Watching frontend files...');
} else {
  await esbuild.build(config);
  console.log('✅ Frontend built successfully');
}
