import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        ink: 'rgb(15 17 21)',
        canvas: 'rgb(250 250 252)',
        muted: 'rgb(100 105 115)',
        line: 'rgb(228 230 235)',
        accent: 'rgb(34 197 94)',
        warn: 'rgb(245 158 11)',
        bad: 'rgb(220 38 38)',
      },
    },
  },
  plugins: [],
}

export default config
